import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button, Checkbox, ErrorNotice, Field, Icon, Input, Select, toE164 } from '@induru/shared';
import { useSession } from '../app/session';
import { api } from '../lib/api';
import { DISTRICTS } from '../lib/constants';
import { StepHeader } from '../components/Page';

const schema = z.object({
  applicant_name: z.string().trim().min(2),
  relation: z.enum(['FATHER', 'MOTHER', 'GUARDIAN', 'SIBLING', 'RELATIVE', 'CANDIDATE']),
  family_name: z.string().trim().min(2).max(80),
  hometown: z.string().trim().min(2).max(80),
  district: z.string().trim().min(2),
  ref_name: z.string().trim().max(80).optional(),
  ref_phone: z.string().trim().optional().refine((v) => !v || !!toE164(v)),
  ref_family_code: z.string().trim().max(12).optional(),
  ref_relation: z.string().trim().max(60).optional(),
  eligibility_declaration: z.literal(true),
});
type Form = z.infer<typeof schema>;

const STEP_FIELDS: (keyof Form)[][] = [
  ['applicant_name', 'relation', 'family_name', 'hometown', 'district'],
  ['ref_name', 'ref_phone', 'ref_family_code', 'ref_relation'],
  ['eligibility_declaration'],
];

/** M04 — field-row motif lives in the step header only; the form stays clean. No Aadhaar field anywhere.
 *  The application is created as pending, never approved directly. */
export default function Apply() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { state, refresh, signOut } = useSession();
  const [step, setStep] = useState(0);
  const [error, setError] = useState<unknown>(null);
  const { register, handleSubmit, trigger, formState: { errors, isSubmitting } } = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: { applicant_name: state?.user.display_name ?? '', relation: 'FATHER', district: 'Nizamabad' },
  });

  if (state?.membership) return <Navigate to="/status" replace />;

  const titles = [t('apply.stepFamily'), t('apply.stepReference'), t('apply.stepDeclaration')];
  const err = (key: keyof Form, msg: string) => (errors[key] ? msg : undefined);

  const next = async () => {
    if (await trigger(STEP_FIELDS[step])) setStep((s) => s + 1);
  };

  const onSubmit = handleSubmit(async (v) => {
    setError(null);
    try {
      await api.applyMembership({
        applicant_name: v.applicant_name, relation: v.relation, family_name: v.family_name,
        hometown: v.hometown, district: v.district, eligibility_declaration: true,
        referral: v.ref_name ? { name: v.ref_name, phone: v.ref_phone ? toE164(v.ref_phone) : null,
          family_code: v.ref_family_code, relation: v.ref_relation } : undefined,
      });
      await refresh();
      navigate('/status', { replace: true });
    } catch (e) {
      setError(e);
    }
  });

  return (
    <form className="screen" onSubmit={onSubmit} noValidate>
      <StepHeader step={step + 1} total={3} title={titles[step]}
        onBack={step > 0 ? () => setStep((s) => s - 1) : undefined}
        trailing={<button type="button" className="link link-muted" style={{ fontSize: 13 }} onClick={() => void signOut()}>{t('apply.saveExit')}</button>} />

      <div className="screen-body" style={{ gap: 18, paddingTop: 22 }}>
        {step === 0 ? (
          <>
            <Field label={t('apply.applicantName')} required error={err('applicant_name', t('apply.errName'))}>
              {(p) => <Input {...p} autoComplete="name" {...register('applicant_name')} />}
            </Field>
            <Field label={t('apply.relation')}>
              {(p) => (
                <Select {...p} {...register('relation')}>
                  {(['FATHER', 'MOTHER', 'GUARDIAN', 'SIBLING', 'RELATIVE', 'CANDIDATE'] as const).map((r) => (
                    <option key={r} value={r}>{t(`family.relations.${r}`)}</option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label={t('apply.familyName')} required hint={t('apply.familyNameHint')} error={err('family_name', t('apply.errFamily'))}>
              {(p) => <Input {...p} {...register('family_name')} />}
            </Field>
            <Field label={t('apply.hometown')} required error={err('hometown', t('apply.errHometown'))}>
              {(p) => <Input {...p} placeholder={t('apply.hometownPlaceholder')} {...register('hometown')} />}
            </Field>
            <Field label={t('apply.district')} required error={err('district', t('common.required'))}>
              {(p) => (
                <Select {...p} {...register('district')}>
                  {DISTRICTS.map((d) => <option key={d} value={d}>{d}</option>)}
                </Select>
              )}
            </Field>
          </>
        ) : null}

        {step === 1 ? (
          <>
            <p className="muted small">{t('apply.referenceIntro')}</p>
            <Field label={t('apply.refFamilyCode')} optional hint={t('apply.refCodeHint')}>
              {(p) => <Input {...p} style={{ letterSpacing: '.06em' }} {...register('ref_family_code')} />}
            </Field>
            <Field label={t('apply.refName')} optional>{(p) => <Input {...p} {...register('ref_name')} />}</Field>
            <Field label={t('apply.refPhone')} optional error={err('ref_phone', t('auth.invalidPhone'))}>
              {(p) => <Input {...p} type="tel" inputMode="tel" {...register('ref_phone')} />}
            </Field>
            <Field label={t('apply.refRelation')} optional>{(p) => <Input {...p} {...register('ref_relation')} />}</Field>
          </>
        ) : null}

        {step === 2 ? (
          <>
            <Checkbox label={t('apply.declaration')} {...register('eligibility_declaration')} />
            {errors.eligibility_declaration ? <p className="field-error" role="alert"><Icon name="circleAlert" size={15} />{t('apply.declarationRequired')}</p> : null}
            <div className="rule-note"><Icon name="lock" size={20} /><span>{t('apply.privacyNote')}</span></div>
          </>
        ) : null}
        <ErrorNotice error={error} />
      </div>

      <div className="screen-foot ruled">
        {step < 2
          ? <Button block onClick={() => void next()}>{t('common.continue')}</Button>
          : <Button block type="submit" loading={isSubmitting}>{t('apply.submit')}</Button>}
      </div>
    </form>
  );
}
