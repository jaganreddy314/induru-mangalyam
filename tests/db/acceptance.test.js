// PRD §15 acceptance scenarios, executed against the real migrations.
import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createTestDb, RpcError } from './harness.js';

let db;
let verifier, broker, moderator, admin;
let phoneSeq = 1000;
const nextPhone = () => `+9199000${String(phoneSeq++).padStart(5, '0')}`;

async function rejects(promise, code) {
  await assert.rejects(promise, (e) => {
    assert.ok(e instanceof RpcError, `expected RpcError, got ${e}`);
    assert.equal(e.code, code);
    return true;
  });
}

async function applyFamily(name = 'Reddy') {
  const parent = await db.createUser(nextPhone());
  await db.rpc(parent, 'apply_membership', {
    p: { applicant_name: `${name} Parent`, family_name: `${name} family`, hometown: 'Armoor', district: 'Nizamabad',
         relation: 'FATHER', eligibility_declaration: true, referral: { name: 'Elder Ref', phone: '+919999988888' } },
  });
  return parent;
}

async function approveFamily(parent) {
  const m = await db.rpc(parent, 'get_my_membership');
  await db.rpc(verifier, 'admin_assign_case', { p_case: m.case_id });
  await db.rpc(verifier, 'admin_decide_membership', { p_family: m.family_id, p_decision: 'APPROVE' });
  return m.family_id;
}

/** Approved family + a live, verified candidate owned by a separate candidate account. */
async function liveCandidate(name, gender) {
  const parent = await applyFamily(name);
  await approveFamily(parent);
  const { candidate_id } = await db.rpc(parent, 'create_candidate_draft', {
    p: { relationship: gender === 'MALE' ? 'SON' : 'DAUGHTER', first_name: name, gender, dob: '1997-04-12',
         education: 'B.Tech', profession: 'Engineer', city: 'Hyderabad', district: 'Nizamabad' },
  });
  const candidatePhone = nextPhone();
  const { token } = await db.rpc(parent, 'create_candidate_invitation', { p_candidate: candidate_id, p_phone: candidatePhone });
  const candidate = await db.createUser(candidatePhone);
  await db.rpc(candidate, 'accept_invitation', { p_token: token });
  await db.rpc(candidate, 'update_candidate_contact', {
    p_candidate: candidate_id, p: { full_name: `${name} Full Name`, email: `${name.toLowerCase()}@example.test` },
  });
  await db.rpc(candidate, 'record_candidate_consents', {
    p_candidate: candidate_id, p_consents: { PARTICIPATE: true, PUBLISH: true },
    p_permissions: JSON.stringify([{ user_id: parent.id, capabilities: ['EDIT_BIODATA', 'SUGGEST_INTEREST', 'VIEW_INTERESTS', 'COORDINATE_MEETINGS'] }]),
  });
  await db.rpc(candidate, 'update_privacy', { p_candidate: candidate_id, p: { visibility: 'MEMBERS' } });
  const caseId = (await db.sql(`select id from app.verification_cases where type='CANDIDATE' and subject_id=$1`, [candidate_id])).rows[0].id;
  await db.rpc(verifier, 'admin_assign_case', { p_case: caseId });
  await db.rpc(verifier, 'admin_decide_candidate', { p_candidate: candidate_id, p_decision: 'VERIFY' });
  const code = (await db.sql('select code from app.candidates where id=$1', [candidate_id])).rows[0].code;
  return { parent, candidate, candidate_id, code };
}

async function mutualIntroduction(a, b) {
  const { match_id } = await db.rpc(a.candidate, 'send_interest', { p_source_candidate: a.candidate_id, p_target_code: b.code });
  const r = await db.rpc(b.candidate, 'decide_match', { p_match: match_id, p_decision: 'ACCEPT' });
  return { match_id, introduction_id: r.introduction_id };
}

before(async () => {
  db = await createTestDb('acceptance');
  verifier = await db.createUser(nextPhone(), { name: 'Verifier V' });
  broker = await db.createUser(nextPhone(), { name: 'Broker B' });
  moderator = await db.createUser(nextPhone(), { name: 'Moderator M' });
  admin = await db.createUser(nextPhone(), { name: 'Admin A' });
  await db.makeStaff(verifier, 'verifier');
  await db.makeStaff(broker, 'broker');
  await db.makeStaff(moderator, 'moderator');
  await db.makeStaff(admin, 'admin');
});

after(async () => {
  await db?.close();
});

describe('membership', () => {
  test('parent submits application → pending only; no discovery before approval', async () => {
    const parent = await applyFamily('Goud');
    const m = await db.rpc(parent, 'get_my_membership');
    assert.equal(m.status, 'APPLIED');
    await rejects(db.rpc(parent, 'discover'), 'MEMBERSHIP_PENDING');
    await rejects(db.rpc(parent, 'create_candidate_draft', { p: { relationship: 'SON', first_name: 'X', gender: 'MALE', dob: '1995-01-01' } }), 'MEMBERSHIP_PENDING');
  });

  test('application is idempotent', async () => {
    const parent = await applyFamily('Rao');
    const again = await db.rpc(parent, 'apply_membership', { p: { applicant_name: 'Other', family_name: 'Other', hometown: 'x', district: 'y', relation: 'FATHER', eligibility_declaration: true } });
    assert.equal(again.family_name, 'Rao family');
    const { rows } = await db.sql('select count(*)::int n from app.family_members where user_id=$1', [parent.id]);
    assert.equal(rows[0].n, 1);
  });

  test('eligibility declaration is required', async () => {
    const u = await db.createUser(nextPhone());
    await rejects(db.rpc(u, 'apply_membership', { p: { applicant_name: 'A B', family_name: 'F', hometown: 'H', district: 'D', relation: 'MOTHER' } }), 'VALIDATION');
  });

  test('approval does not publish any candidate', async () => {
    const parent = await applyFamily('Naidu');
    await approveFamily(parent);
    const { candidate_id } = await db.rpc(parent, 'create_candidate_draft', { p: { relationship: 'SON', first_name: 'Ravi', gender: 'MALE', dob: '1996-02-02' } });
    const c = await db.rpc(parent, 'get_candidate_for_edit', { p_candidate: candidate_id });
    assert.equal(c.status, 'DRAFT');
    assert.equal(c.discoverable, false);
  });

  test('decline requires a message; NEEDS_INFO round trip', async () => {
    const parent = await applyFamily('Varma');
    const m = await db.rpc(parent, 'get_my_membership');
    await db.rpc(verifier, 'admin_assign_case', { p_case: m.case_id });
    await rejects(db.rpc(verifier, 'admin_decide_membership', { p_family: m.family_id, p_decision: 'DECLINE' }), 'VALIDATION');
    await db.rpc(verifier, 'admin_decide_membership', { p_family: m.family_id, p_decision: 'NEEDS_INFO', p_applicant_message: 'Please add a reference' });
    assert.equal((await db.rpc(parent, 'get_my_membership')).status, 'NEEDS_INFO');
    await db.rpc(parent, 'update_membership_application', { p: { referral: { name: 'Second Ref' } } });
    assert.equal((await db.rpc(parent, 'get_my_membership')).status, 'UNDER_REVIEW');
  });

  test('staff calls require MFA (aal2)', async () => {
    const v2 = await db.createUser(nextPhone());
    await db.makeStaff(v2, 'verifier');
    v2.aal = 'aal1';
    await rejects(db.rpc(v2, 'admin_overview'), 'MFA_REQUIRED');
  });

  test('non-staff cannot call admin RPCs; anon cannot call anything', async () => {
    const u = await db.createUser(nextPhone());
    await rejects(db.rpc(u, 'admin_overview'), 'FORBIDDEN');
    await rejects(db.rpc(null, 'discover'), 'PERMISSION_DENIED');
  });
});

describe('candidate consent', () => {
  test('parent-created profile stays DRAFT and is never searchable', async () => {
    const viewer = await liveCandidate('Viewer', 'MALE');
    const parent = await applyFamily('Draft');
    await approveFamily(parent);
    const { candidate_id } = await db.rpc(parent, 'create_candidate_draft', { p: { relationship: 'DAUGHTER', first_name: 'Hidden', gender: 'FEMALE', dob: '1998-01-01' } });
    const code = (await db.sql('select code from app.candidates where id=$1', [candidate_id])).rows[0].code;
    const page = await db.rpc(viewer.parent, 'discover', { p_filters: {} });
    assert.ok(!page.items.some((i) => i.code === code));
    await rejects(db.rpc(viewer.parent, 'get_profile', { p_code: code }), 'PROFILE_PRIVATE');
  });

  test('parent cannot publish or consent; candidate invitation cannot be accepted by the parent', async () => {
    const parent = await applyFamily('Pub');
    await approveFamily(parent);
    const { candidate_id } = await db.rpc(parent, 'create_candidate_draft', { p: { relationship: 'SON', first_name: 'Kiran', gender: 'MALE', dob: '1995-05-05' } });
    await rejects(db.rpc(parent, 'record_candidate_consents', { p_candidate: candidate_id, p_consents: { PARTICIPATE: true, PUBLISH: true } }), 'FORBIDDEN');
    await rejects(db.rpc(parent, 'update_privacy', { p_candidate: candidate_id, p: { visibility: 'MEMBERS' } }), 'FORBIDDEN');
    assert.equal((await db.audit('consent.record', 'DENIED')).length >= 1, true);

    await rejects(db.rpc(parent, 'create_candidate_invitation', { p_candidate: candidate_id, p_phone: parent.phone }), 'VALIDATION');
    const { token } = await db.rpc(parent, 'create_candidate_invitation', { p_candidate: candidate_id, p_phone: nextPhone() });
    await rejects(db.rpc(parent, 'accept_invitation', { p_token: token }), 'INVITATION_PHONE_MISMATCH');
    const stranger = await db.createUser(nextPhone());
    await rejects(db.rpc(stranger, 'accept_invitation', { p_token: token }), 'INVITATION_PHONE_MISMATCH');
  });

  test('staff cannot verify without candidate consent', async () => {
    const parent = await applyFamily('NoConsent');
    await approveFamily(parent);
    const { candidate_id } = await db.rpc(parent, 'create_candidate_draft', { p: { relationship: 'SON', first_name: 'Raju', gender: 'MALE', dob: '1995-05-05' } });
    await db.sql(`insert into app.verification_cases (type, subject_id, reviewer_id, status) values ('CANDIDATE', $1, $2, 'IN_REVIEW')`, [candidate_id, verifier.id]);
    await rejects(db.rpc(verifier, 'admin_decide_candidate', { p_candidate: candidate_id, p_decision: 'VERIFY' }), 'CONSENT_REQUIRED');
  });

  test('consent requires recent authentication', async () => {
    const parent = await applyFamily('Fresh');
    await approveFamily(parent);
    const { candidate_id } = await db.rpc(parent, 'create_candidate_draft', { p: { relationship: 'SON', first_name: 'Old', gender: 'MALE', dob: '1995-05-05' } });
    const phone = nextPhone();
    const { token } = await db.rpc(parent, 'create_candidate_invitation', { p_candidate: candidate_id, p_phone: phone });
    const cand = await db.createUser(phone);
    await db.rpc(cand, 'accept_invitation', { p_token: token });
    cand.authAt = Math.floor(Date.now() / 1000) - 3 * 3600;
    await rejects(db.rpc(cand, 'record_candidate_consents', { p_candidate: candidate_id, p_consents: { PARTICIPATE: true } }), 'REAUTH_REQUIRED');
  });

  test('under-age candidate cannot consent to publication', async () => {
    const parent = await applyFamily('Young');
    await approveFamily(parent);
    const dob = new Date(); dob.setFullYear(dob.getFullYear() - 19);
    const { candidate_id } = await db.rpc(parent, 'create_candidate_draft', { p: { relationship: 'SON', first_name: 'Teen', gender: 'MALE', dob: dob.toISOString().slice(0, 10) } });
    const phone = nextPhone();
    const { token } = await db.rpc(parent, 'create_candidate_invitation', { p_candidate: candidate_id, p_phone: phone });
    const cand = await db.createUser(phone);
    await db.rpc(cand, 'accept_invitation', { p_token: token });
    await rejects(db.rpc(cand, 'record_candidate_consents', { p_candidate: candidate_id, p_consents: { PARTICIPATE: true, PUBLISH: true } }), 'AGE_INELIGIBLE');
  });

  test('candidate denies consent → invisible; no outbound interest in their name', async () => {
    const other = await liveCandidate('OtherSide', 'FEMALE');
    const parent = await applyFamily('Denier');
    await approveFamily(parent);
    const { candidate_id } = await db.rpc(parent, 'create_candidate_draft', { p: { relationship: 'SON', first_name: 'Denier', gender: 'MALE', dob: '1994-01-01' } });
    const phone = nextPhone();
    const { token } = await db.rpc(parent, 'create_candidate_invitation', { p_candidate: candidate_id, p_phone: phone });
    const cand = await db.createUser(phone);
    await db.rpc(cand, 'accept_invitation', { p_token: token });
    await db.rpc(cand, 'record_candidate_consents', {
      p_candidate: candidate_id, p_consents: { PARTICIPATE: false, PUBLISH: false },
      p_permissions: JSON.stringify([{ user_id: parent.id, capabilities: ['SUGGEST_INTEREST'] }]),
    });
    await rejects(db.rpc(parent, 'send_interest', { p_source_candidate: candidate_id, p_target_code: other.code }), 'CONSENT_REQUIRED');
  });

  test('candidate revokes parent permission → parent edits forbidden immediately', async () => {
    const live = await liveCandidate('Revoke', 'MALE');
    await db.rpc(live.parent, 'update_candidate_details', { p_candidate: live.candidate_id, p: { bio: 'Edited by parent' } });
    await db.rpc(live.candidate, 'set_family_permissions', {
      p_candidate: live.candidate_id, p_permissions: JSON.stringify([{ user_id: live.parent.id, capabilities: [] }]),
    });
    await rejects(db.rpc(live.parent, 'update_candidate_details', { p_candidate: live.candidate_id, p: { bio: 'Again' } }), 'FORBIDDEN');
    assert.ok((await db.audit('candidate.update_details', 'DENIED')).length >= 1);
  });

  test('material edit on a live profile sends it back to review', async () => {
    const live = await liveCandidate('Material', 'MALE');
    const r = await db.rpc(live.candidate, 'update_candidate_details', { p_candidate: live.candidate_id, p: { marital_status: 'DIVORCED' } });
    assert.equal(r.status, 'UNDER_REVIEW');
    assert.equal(r.discoverable, false);
  });
});

describe('discovery', () => {
  test('unverified user calls discover → error and no data', async () => {
    const u = await db.createUser(nextPhone());
    await rejects(db.rpc(u, 'discover'), 'MEMBERSHIP_PENDING');
  });

  test('results are a safe projection with cursor pagination', async () => {
    const a = await liveCandidate('ProjA', 'MALE');
    await liveCandidate('ProjB', 'FEMALE');
    await liveCandidate('ProjC', 'FEMALE');
    const p1 = await db.rpc(a.parent, 'discover', { p_filters: { gender: 'FEMALE' }, p_limit: 1 });
    assert.equal(p1.items.length, 1);
    assert.ok(p1.next_cursor);
    const p2 = await db.rpc(a.parent, 'discover', { p_filters: { gender: 'FEMALE' }, p_limit: 1, p_cursor: p1.next_cursor });
    assert.notEqual(p2.items[0].code, p1.items[0].code);
    const allowed = new Set(['code', 'age', 'gender', 'height_cm', 'marital_status', 'education', 'profession', 'city', 'district', 'verified', 'has_photo', 'shortlisted']);
    for (const k of Object.keys(p1.items[0])) assert.ok(allowed.has(k), `unexpected field ${k}`);
    const profile = await db.rpc(a.parent, 'get_profile', { p_code: p1.items[0].code });
    assert.deepEqual(profile.checks, { phone_verified: true, family_verified: true, consent_confirmed: true, profile_reviewed: true });
    for (const forbidden of ['dob', 'phone', 'email', 'full_name', 'id', 'candidate_id', 'photo_path']) {
      assert.ok(!(forbidden in profile), `profile leaks ${forbidden}`);
    }
  });

  test('own family candidates are excluded; enumeration is rate limited', async () => {
    const a = await liveCandidate('Enum', 'MALE');
    const page = await db.rpc(a.parent, 'discover', { p_limit: 50 });
    assert.ok(!page.items.some((i) => i.code === a.code));
    await db.sql(`update app.config set value = '3' where key = 'rate_profile_per_hour'`);
    try {
      for (let i = 0; i < 3; i++) await db.rpc(a.parent, 'get_profile', { p_code: 'IM-NOPE' + i }).catch(() => {});
      await rejects(db.rpc(a.parent, 'get_profile', { p_code: 'IM-NOPE9' }), 'RATE_LIMITED');
    } finally {
      await db.sql(`update app.config set value = '200' where key = 'rate_profile_per_hour'`);
    }
  });

  test('shortlist is private and does not notify the target', async () => {
    const a = await liveCandidate('ShortA', 'MALE');
    const b = await liveCandidate('ShortB', 'FEMALE');
    const before = (await db.sql('select count(*)::int n from app.notifications where recipient_id in ($1,$2)', [b.parent.id, b.candidate.id])).rows[0].n;
    await db.rpc(a.parent, 'save_shortlist', { p_code: b.code, p_note: 'Good match' });
    const list = await db.rpc(a.parent, 'list_shortlist');
    assert.equal(list[0].code, b.code);
    const afterN = (await db.sql('select count(*)::int n from app.notifications where recipient_id in ($1,$2)', [b.parent.id, b.candidate.id])).rows[0].n;
    assert.equal(afterN, before);
  });

  test('candidate pauses or withdraws → disappears from search', async () => {
    const a = await liveCandidate('Seeker', 'MALE');
    const b = await liveCandidate('Pauser', 'FEMALE');
    const codes = async () => (await db.rpc(a.parent, 'discover', { p_limit: 50 })).items.map((i) => i.code);
    assert.ok((await codes()).includes(b.code));
    await db.rpc(b.candidate, 'pause_candidate', { p_candidate: b.candidate_id });
    assert.ok(!(await codes()).includes(b.code));
    await db.rpc(b.candidate, 'resume_candidate', { p_candidate: b.candidate_id });
    assert.ok((await codes()).includes(b.code));
    await db.rpc(b.candidate, 'withdraw_candidate', { p_candidate: b.candidate_id, p_request_deletion: true });
    assert.ok(!(await codes()).includes(b.code));
    await rejects(db.rpc(a.parent, 'get_profile', { p_code: b.code }), 'PROFILE_PRIVATE');
    const { rows } = await db.sql(`select count(*)::int n from app.deletion_requests where candidate_id=$1`, [b.candidate_id]);
    assert.equal(rows[0].n, 1);
  });

  test('blocking hides profiles in both directions', async () => {
    const a = await liveCandidate('BlockA', 'MALE');
    const b = await liveCandidate('BlockB', 'FEMALE');
    await db.rpc(a.parent, 'block_profile', { p_code: b.code });
    assert.ok(!(await db.rpc(a.parent, 'discover', { p_limit: 50 })).items.some((i) => i.code === b.code));
    assert.ok(!(await db.rpc(b.parent, 'discover', { p_limit: 50 })).items.some((i) => i.code === a.code));
  });
});

describe('interests & introductions', () => {
  test('family-initiated interest needs source candidate confirmation, then target decision', async () => {
    const a = await liveCandidate('FamA', 'MALE');
    const b = await liveCandidate('FamB', 'FEMALE');
    const { match_id } = await db.rpc(a.parent, 'send_interest', { p_source_candidate: a.candidate_id, p_target_code: b.code, p_message: 'Namaskaram' });
    // Target side does not see it before the source candidate confirms.
    assert.equal((await db.rpc(b.candidate, 'list_interests', { p_box: 'RECEIVED' })).length, 0);
    await rejects(db.rpc(a.parent, 'decide_match', { p_match: match_id, p_decision: 'ACCEPT' }), 'FORBIDDEN');
    await db.rpc(a.candidate, 'decide_match', { p_match: match_id, p_decision: 'ACCEPT' });
    const received = await db.rpc(b.candidate, 'list_interests', { p_box: 'RECEIVED' });
    assert.equal(received.length, 1);
    assert.equal(received[0].can_decide, true);
  });

  test('one side accepts → no contact disclosure or introduction', async () => {
    const a = await liveCandidate('OneA', 'MALE');
    const b = await liveCandidate('OneB', 'FEMALE');
    const { match_id } = await db.rpc(a.candidate, 'send_interest', { p_source_candidate: a.candidate_id, p_target_code: b.code });
    const { rows } = await db.sql('select count(*)::int n from app.introductions where match_id=$1', [match_id]);
    assert.equal(rows[0].n, 0);
  });

  test('duplicate interest retry returns the same match', async () => {
    const a = await liveCandidate('DupA', 'MALE');
    const b = await liveCandidate('DupB', 'FEMALE');
    const r1 = await db.rpc(a.candidate, 'send_interest', { p_source_candidate: a.candidate_id, p_target_code: b.code });
    const r2 = await db.rpc(a.candidate, 'send_interest', { p_source_candidate: a.candidate_id, p_target_code: b.code });
    const r3 = await db.rpc(b.candidate, 'send_interest', { p_source_candidate: b.candidate_id, p_target_code: a.code });
    assert.equal(r2.match_id, r1.match_id);
    assert.equal(r3.match_id, r1.match_id);
    assert.equal(r2.duplicate, true);
  });

  test('decline leaks no reason and is terminal', async () => {
    const a = await liveCandidate('DecA', 'MALE');
    const b = await liveCandidate('DecB', 'FEMALE');
    const { match_id } = await db.rpc(a.candidate, 'send_interest', { p_source_candidate: a.candidate_id, p_target_code: b.code });
    await db.rpc(b.candidate, 'decide_match', { p_match: match_id, p_decision: 'DECLINE' });
    const closed = await db.rpc(a.candidate, 'list_interests', { p_box: 'CLOSED' });
    assert.equal(closed[0].status, 'DECLINED');
    assert.ok(!('reason' in closed[0]));
    await rejects(db.rpc(b.candidate, 'decide_match', { p_match: match_id, p_decision: 'ACCEPT' }), 'INVALID_STATE');
    await rejects(db.rpc(a.candidate, 'send_interest', { p_source_candidate: a.candidate_id, p_target_code: b.code }), 'INVALID_STATE');
  });

  test('both approvals → contact step enabled, no automatic reveal', async () => {
    const a = await liveCandidate('MutA', 'MALE');
    const b = await liveCandidate('MutB', 'FEMALE');
    const { introduction_id } = await mutualIntroduction(a, b);
    assert.ok(introduction_id);
    const intro = await db.rpc(a.candidate, 'get_introduction', { p_intro: introduction_id });
    assert.equal(intro.stage, 'PENDING_CONTACT');
    assert.deepEqual(await db.rpc(a.candidate, 'get_introduction_contacts', { p_intro: introduction_id }), []);
  });

  test('candidate grants only email to a specific recipient → only that is readable', async () => {
    const a = await liveCandidate('GrantA', 'MALE');
    const b = await liveCandidate('GrantB', 'FEMALE');
    const { introduction_id } = await mutualIntroduction(a, b);
    await db.rpc(b.candidate, 'grant_contact', { p_intro: introduction_id, p_recipient: a.candidate.id, p_fields: ['EMAIL'], p_expires_in_days: 7 });
    const seen = await db.rpc(a.candidate, 'get_introduction_contacts', { p_intro: introduction_id });
    assert.equal(seen.length, 1);
    assert.equal(seen[0].email, 'grantb@example.test');
    assert.ok(!('phone' in seen[0]) && !('full_name' in seen[0]));
    // The other family member (A's parent) received nothing.
    assert.deepEqual(await db.rpc(a.parent, 'get_introduction_contacts', { p_intro: introduction_id }), []);
    // Parent cannot grant on the candidate's behalf.
    await rejects(db.rpc(b.parent, 'grant_contact', { p_intro: introduction_id, p_recipient: a.candidate.id, p_fields: ['PHONE'] }), 'FORBIDDEN');
    // A recipient outside the introduction is refused and audited.
    const outsider = await db.createUser(nextPhone());
    await rejects(db.rpc(b.candidate, 'grant_contact', { p_intro: introduction_id, p_recipient: outsider.id, p_fields: ['PHONE'] }), 'UNAUTHORISED_RECIPIENT');
    assert.ok((await db.audit('contact.grant', 'DENIED')).length >= 1);
    assert.ok((await db.audit('contact.read', 'ALLOWED')).length >= 1);
  });

  test('candidate revokes contact grant → new retrieval blocked and audited', async () => {
    const a = await liveCandidate('RevA', 'MALE');
    const b = await liveCandidate('RevB', 'FEMALE');
    const { introduction_id } = await mutualIntroduction(a, b);
    const { grant_id } = await db.rpc(b.candidate, 'grant_contact', { p_intro: introduction_id, p_recipient: a.candidate.id, p_fields: ['PHONE'] });
    assert.equal((await db.rpc(a.candidate, 'get_introduction_contacts', { p_intro: introduction_id })).length, 1);
    await db.rpc(b.candidate, 'revoke_contact_grant', { p_grant: grant_id });
    assert.deepEqual(await db.rpc(a.candidate, 'get_introduction_contacts', { p_intro: introduction_id }), []);
    assert.equal((await db.audit('contact.revoke', 'ALLOWED')).length >= 1, true);
  });

  test('mutual grants → INTRODUCED; meetings are idempotent and move stage', async () => {
    const a = await liveCandidate('MeetA', 'MALE');
    const b = await liveCandidate('MeetB', 'FEMALE');
    const { introduction_id } = await mutualIntroduction(a, b);
    await db.rpc(a.candidate, 'grant_contact', { p_intro: introduction_id, p_recipient: b.candidate.id, p_fields: ['PHONE'] });
    await db.rpc(b.candidate, 'grant_contact', { p_intro: introduction_id, p_recipient: a.candidate.id, p_fields: ['PHONE'] });
    assert.equal((await db.rpc(a.candidate, 'get_introduction', { p_intro: introduction_id })).stage, 'INTRODUCED');
    const when = new Date(Date.now() + 7 * 86400e3).toISOString();
    const args = { p_intro: introduction_id, p_start_at: when, p_timezone: 'Asia/Kolkata', p_format: 'IN_PERSON', p_location_hint: 'Temple, Nizamabad', p_idempotency_key: 'k1' };
    const m1 = await db.rpc(a.parent, 'propose_meeting', args);
    const m2 = await db.rpc(a.parent, 'propose_meeting', args);
    assert.equal(m1, m2);
    await rejects(db.rpc(a.candidate, 'respond_meeting', { p_meeting: m1, p_response: 'ACCEPT' }), 'FORBIDDEN');
    await db.rpc(b.candidate, 'respond_meeting', { p_meeting: m1, p_response: 'ACCEPT' });
    assert.equal((await db.rpc(b.candidate, 'get_introduction', { p_intro: introduction_id })).stage, 'MEETING_PLANNED');
    await db.rpc(a.candidate, 'confirm_match', { p_intro: introduction_id });
    const r = await db.rpc(b.candidate, 'confirm_match', { p_intro: introduction_id });
    assert.equal(r.stage, 'MATCH_CONFIRMED');
  });

  test('broker suggestion still needs both candidates; broker bypass is blocked and audited', async () => {
    const a = await liveCandidate('BrkA', 'MALE');
    const b = await liveCandidate('BrkB', 'FEMALE');
    const { match_id } = await db.rpc(broker, 'admin_suggest_match', { p_source: a.candidate_id, p_target: b.candidate_id, p_rationale: 'Same district, mutual age prefs' });
    await rejects(db.rpc(broker, 'decide_match', { p_match: match_id, p_decision: 'ACCEPT' }), 'FORBIDDEN');
    assert.ok((await db.audit('match.decide', 'DENIED')).length >= 1);
    await db.rpc(a.candidate, 'decide_match', { p_match: match_id, p_decision: 'ACCEPT' });
    const r = await db.rpc(b.candidate, 'decide_match', { p_match: match_id, p_decision: 'ACCEPT' });
    assert.equal(r.status, 'MUTUALLY_ACCEPTED');
    await db.rpc(broker, 'admin_assign_broker', { p_intro: r.introduction_id, p_broker: broker.id });
    await rejects(db.rpc(broker, 'admin_set_intro_stage', { p_intro: r.introduction_id, p_stage: 'INTRODUCED' }), 'CONSENT_REQUIRED');
    await rejects(db.rpc(broker, 'admin_set_intro_stage', { p_intro: r.introduction_id, p_stage: 'DISCUSSING' }), 'CONSENT_REQUIRED');
    assert.ok((await db.audit('admin.introduction.stage', 'DENIED')).length >= 2);
    // Broker sees grant metadata, never contact values.
    await db.rpc(a.candidate, 'grant_contact', { p_intro: r.introduction_id, p_recipient: b.candidate.id, p_fields: ['PHONE'] });
    const view = await db.rpc(broker, 'admin_get_introduction', { p_intro: r.introduction_id });
    assert.ok(!JSON.stringify(view).includes('+9199'));
    await db.rpc(broker, 'admin_add_broker_note', { p_intro: r.introduction_id, p_body: 'Families prefer Sunday' });
    const withNote = await db.rpc(broker, 'admin_get_introduction', { p_intro: r.introduction_id });
    assert.equal(withNote.notes[0].body, 'Families prefer Sunday');
    const raw = (await db.sql('select body_enc::text t from app.broker_notes limit 1')).rows[0].t;
    assert.ok(!raw.includes('Sunday'));
  });

  test('withdrawal closes introductions and blocks contact retrieval', async () => {
    const a = await liveCandidate('WdA', 'MALE');
    const b = await liveCandidate('WdB', 'FEMALE');
    const { introduction_id } = await mutualIntroduction(a, b);
    await db.rpc(b.candidate, 'grant_contact', { p_intro: introduction_id, p_recipient: a.candidate.id, p_fields: ['PHONE'] });
    await db.rpc(b.candidate, 'withdraw_candidate', { p_candidate: b.candidate_id });
    await rejects(db.rpc(a.candidate, 'get_introduction_contacts', { p_intro: introduction_id }), 'INVALID_STATE');
  });

  test('non-participant cannot read an introduction', async () => {
    const a = await liveCandidate('NpA', 'MALE');
    const b = await liveCandidate('NpB', 'FEMALE');
    const c = await liveCandidate('NpC', 'FEMALE');
    const { introduction_id } = await mutualIntroduction(a, b);
    await rejects(db.rpc(c.candidate, 'get_introduction', { p_intro: introduction_id }), 'FORBIDDEN');
    await rejects(db.rpc(c.candidate, 'get_introduction_contacts', { p_intro: introduction_id }), 'FORBIDDEN');
  });
});

describe('verification & safety', () => {
  test('verifier opening unrelated evidence is denied and logged', async () => {
    const parent = await applyFamily('Evid');
    const m = await db.rpc(parent, 'get_my_membership');
    const evId = await db.rpc(parent, 'register_evidence', { p_case_id: m.case_id, p_type: 'REFERENCE_LETTER', p_storage_path: `${m.case_id}/letter.pdf` });
    await rejects(db.rpc(verifier, 'admin_open_evidence', { p_evidence: evId }), 'FORBIDDEN');
    assert.ok((await db.audit('admin.evidence.open', 'DENIED')).length >= 1);
    await db.rpc(verifier, 'admin_assign_case', { p_case: m.case_id });
    const opened = await db.rpc(verifier, 'admin_open_evidence', { p_evidence: evId });
    assert.equal(opened.storage_path, `${m.case_id}/letter.pdf`);
    // Another verifier still cannot.
    const v2 = await db.createUser(nextPhone());
    await db.makeStaff(v2, 'verifier');
    await rejects(db.rpc(v2, 'admin_open_evidence', { p_evidence: evId }), 'FORBIDDEN');
  });

  test('evidence path must belong to the caller’s own case', async () => {
    const p1 = await applyFamily('EvA');
    const p2 = await applyFamily('EvB');
    const m2 = await db.rpc(p2, 'get_my_membership');
    await rejects(db.rpc(p1, 'register_evidence', { p_case_id: m2.case_id, p_type: 'OTHER', p_storage_path: `${m2.case_id}/x.pdf` }), 'FORBIDDEN');
  });

  test('unsafe report → urgent support case; reporter can pause own profile', async () => {
    const a = await liveCandidate('RepA', 'FEMALE');
    const id = await db.rpc(a.candidate, 'file_report', { p_category: 'PRESSURE', p_description: 'I am being pressured to accept.', p_urgent: true, p_pause_my_profile: true });
    const queue = await db.rpc(moderator, 'admin_list_support');
    assert.ok(queue.some((c) => c.id === id && c.severity === 'URGENT'));
    const c = await db.rpc(a.candidate, 'get_candidate_for_edit', { p_candidate: a.candidate_id });
    assert.equal(c.status, 'PAUSED');
    await db.rpc(moderator, 'admin_update_support', { p_case: id, p: { status: 'TRIAGED' } });
    assert.equal((await db.rpc(a.candidate, 'list_my_reports'))[0].status, 'TRIAGED');
  });

  test('moderator suspension removes profile from discovery; restricted user is locked out', async () => {
    const a = await liveCandidate('ModA', 'MALE');
    const b = await liveCandidate('ModB', 'FEMALE');
    await db.rpc(moderator, 'admin_set_candidate_suspension', { p_candidate: b.candidate_id, p_suspend: true, p_reason: 'Impersonation report' });
    assert.ok(!(await db.rpc(a.parent, 'discover', { p_limit: 50 })).items.some((i) => i.code === b.code));
    await db.rpc(moderator, 'admin_set_user_restriction', { p_user: a.parent.id, p_restrict: true, p_reason: 'Harassment' });
    await rejects(db.rpc(a.parent, 'discover'), 'ACCOUNT_RESTRICTED');
  });

  test('audit log is append-only and audit reads are themselves logged', async () => {
    await assert.rejects(db.sql(`update app.audit_events set action = 'x'`));
    await assert.rejects(db.sql(`delete from app.audit_events`));
    await db.rpc(admin, 'admin_list_audit', { p_filters: {} });
    assert.ok((await db.audit('admin.audit.view')).length >= 1);
    await rejects(db.rpc(broker, 'admin_list_audit', { p_filters: {} }), 'FORBIDDEN');
  });

  test('authenticated role has no direct table access', async () => {
    const u = await db.createUser(nextPhone());
    await db.sql('begin');
    await db.sql('set local role authenticated');
    await assert.rejects(db.sql('select * from app.candidates'), /permission denied/);
    await db.sql('rollback');
    void u;
  });
});

describe('storage policies', () => {
  test('photos: private by default, readable only via grant or MEMBERS setting', async () => {
    const a = await liveCandidate('PhotoA', 'MALE');
    const b = await liveCandidate('PhotoB', 'FEMALE');
    const path = `${b.candidate_id}/p.jpg`;
    // Only an editor of B may upload into B's folder.
    await assert.rejects(db.asUser(a.candidate, `insert into storage.objects (bucket_id, name) values ('photos', $1)`, [path]));
    await db.asUser(b.candidate, `insert into storage.objects (bucket_id, name) values ('photos', $1)`, [path]);
    await db.rpc(b.candidate, 'set_candidate_photo', { p_candidate: b.candidate_id, p_storage_path: path });
    await db.sql('update app.candidate_details set photo_approved = true where candidate_id = $1', [b.candidate_id]);
    const visible = async (u) => (await db.asUser(u, `select name from storage.objects where bucket_id='photos' and name=$1`, [path])).length;
    assert.equal(await visible(a.parent), 0);
    assert.equal(await visible(b.parent), 1, 'own family can see');
    const { introduction_id } = await mutualIntroduction(a, b);
    await db.rpc(b.candidate, 'grant_contact', { p_intro: introduction_id, p_recipient: a.candidate.id, p_fields: ['PHOTO'] });
    assert.equal(await visible(a.candidate), 1, 'recipient of PHOTO grant can see');
    assert.equal(await visible(a.parent), 0, 'grant is per recipient');
    await db.rpc(b.candidate, 'update_privacy', { p_candidate: b.candidate_id, p: { photo_visibility: 'MEMBERS' } });
    assert.equal(await visible(a.parent), 1, 'MEMBERS setting opens to approved members');
  });

  test('evidence: upload into own case only; read only by the assigned reviewer', async () => {
    const parent = await applyFamily('StoreEv');
    const other = await applyFamily('StoreEv2');
    const m = await db.rpc(parent, 'get_my_membership');
    const path = `${m.case_id}/doc.pdf`;
    await assert.rejects(db.asUser(other, `insert into storage.objects (bucket_id, name) values ('evidence', $1)`, [path]));
    await db.asUser(parent, `insert into storage.objects (bucket_id, name) values ('evidence', $1)`, [path]);
    await db.rpc(parent, 'register_evidence', { p_case_id: m.case_id, p_type: 'OTHER', p_storage_path: path });
    const canRead = async (u) => (await db.asUser(u, `select 1 from storage.objects where bucket_id='evidence' and name=$1`, [path])).length;
    assert.equal(await canRead(parent), 0, 'applicant cannot read back');
    assert.equal(await canRead(verifier), 0, 'unassigned verifier cannot read');
    await db.rpc(verifier, 'admin_assign_case', { p_case: m.case_id });
    assert.equal(await canRead(verifier), 1);
  });
});
