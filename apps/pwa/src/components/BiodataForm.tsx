import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button, Field, Input, Select, Textarea, type CandidateDetails } from '@induru/shared';
import { DISTRICTS } from '../lib/constants';

const optionalText = (max: number) => z.string().trim().max(max).optional().or(z.literal(''));

export const biodataSchema = z.object({
  first_name: z.string().trim().min(1).max(40),
  gender: z.enum(['MALE', 'FEMALE']),
  dob: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  height_cm: z.union([z.coerce.number().int().min(120).max(230), z.literal('')]).optional(),
  marital_status: z.enum(['NEVER_MARRIED', 'DIVORCED', 'WIDOWED', 'AWAITING_DIVORCE']),
  education: optionalText(120),
  profession: optionalText(120),
  city: optionalText(60),
  district: optionalText(60),
  state: optionalText(60),
  bio: optionalText(1000),
  family_summary: optionalText(600),
  gotram: optionalText(40),
  star: optionalText(40),
  raasi: optionalText(40),
});
export type BiodataValues = z.infer<typeof biodataSchema>;

export function toPayload(v: BiodataValues) {
  const { gotram, star, raasi, height_cm, ...rest } = v;
  const customs = Object.fromEntries(Object.entries({ gotram, star, raasi }).filter(([, x]) => x));
  return { ...rest, height_cm: height_cm === '' || height_cm == null ? null : height_cm, customs };
}

export function fromDetails(d?: CandidateDetails): Partial<BiodataValues> {
  if (!d) return { gender: 'FEMALE', marital_status: 'NEVER_MARRIED', state: 'Telangana', district: 'Nizamabad' };
  return {
    first_name: d.first_name, gender: d.gender, dob: d.dob, height_cm: d.height_cm ?? '', marital_status: d.marital_status,
    education: d.education ?? '', profession: d.profession ?? '', city: d.city ?? '', district: d.district ?? '',
    state: d.state ?? '', bio: d.bio ?? '', family_summary: d.family_summary ?? '',
    gotram: d.customs?.gotram ?? '', star: d.customs?.star ?? '', raasi: d.customs?.raasi ?? '',
  };
}

const GROUPS: (keyof BiodataValues)[][] = [
  ['first_name', 'gender', 'dob', 'education', 'city', 'profession'],
  ['marital_status', 'height_cm', 'district', 'state', 'bio', 'family_summary'],
  ['gotram', 'star', 'raasi'],
];

/** M08 biodata fields. Shared by "add profile" (4-step wizard: basics, about & family, customs, review)
 *  and "edit biodata" (one form). Privacy reassurance sits next to the field it concerns. */
export function BiodataForm({ initial, onSubmit, submitLabel, disabled, showMaterialNote, children, wizardStep, onWizardStep, footer }: {
  initial?: CandidateDetails;
  onSubmit: (values: BiodataValues) => Promise<void>;
  submitLabel: string;
  disabled?: boolean;
  showMaterialNote?: boolean;
  children?: ReactNode;
  /** 0–3 when used as a wizard; undefined renders every field. */
  wizardStep?: number;
  onWizardStep?: (step: number) => void;
  footer?: (button: ReactNode) => ReactNode;
}) {
  const { t } = useTranslation();
  const { register, handleSubmit, trigger, watch, formState: { errors, isSubmitting, isDirty } } = useForm<BiodataValues>({
    resolver: zodResolver(biodataSchema),
    defaultValues: fromDetails(initial),
  });
  const req = t('common.required');
  const maxDob = new Date();
  maxDob.setFullYear(maxDob.getFullYear() - 18);
  const wiz = wizardStep !== undefined;
  const show = (g: number) => !wiz || wizardStep === g;
  const dob = watch('dob');
  const age = dob ? Math.floor((Date.now() - new Date(dob).getTime()) / 31_557_600_000) : null;

  const nextLabels = [t('candidate.nextAbout'), t('candidate.nextCustoms'), t('candidate.nextReview')];
  const button = wiz && wizardStep! < 3
    ? <Button block disabled={disabled} onClick={() => void trigger(GROUPS[wizardStep!]).then((ok) => ok && onWizardStep?.(wizardStep! + 1))}>{nextLabels[wizardStep!]}</Button>
    : <Button type="submit" block loading={isSubmitting} disabled={disabled || (!!initial && !isDirty)}>{submitLabel}</Button>;
  const v = watch();

  return (
    <form className="stack" onSubmit={handleSubmit(onSubmit)} noValidate style={{ gap: 18 }}>
      <fieldset disabled={disabled} className="stack" style={{ border: 0, padding: 0, margin: 0, gap: 18 }}>
        {show(0) ? (
          <>
            {children}
            <Field label={t('candidate.firstName')} required hint={t('candidate.firstNameHint')} error={errors.first_name && req}>
              {(p) => <Input {...p} autoComplete="off" {...register('first_name')} />}
            </Field>
            <Field label={t('candidate.gender')} required>
              {(p) => (
                <Select {...p} {...register('gender')}>
                  <option value="FEMALE">{t('candidate.genders.FEMALE')}</option>
                  <option value="MALE">{t('candidate.genders.MALE')}</option>
                </Select>
              )}
            </Field>
            <Field label={t('candidate.dob')} required error={errors.dob && req}
              hint={age && age > 0 ? t('candidate.dobHintAge', { age }) : t('candidate.dobHint')}>
              {(p) => <Input {...p} type="date" max={maxDob.toISOString().slice(0, 10)} {...register('dob')} style={{ fontVariantNumeric: 'tabular-nums' }} />}
            </Field>
            <div className="grid-2">
              <Field label={t('candidate.education')}>{(p) => <Input {...p} {...register('education')} />}</Field>
              <Field label={t('candidate.city')}>{(p) => <Input {...p} {...register('city')} />}</Field>
            </div>
            <Field label={t('candidate.profession')}>{(p) => <Input {...p} placeholder={t('candidate.professionPlaceholder')} {...register('profession')} />}</Field>
          </>
        ) : null}

        {show(1) ? (
          <>
            {!wiz ? <hr className="divider" /> : null}
            <div className="grid-2">
              <Field label={t('candidate.maritalStatus')} required>
                {(p) => (
                  <Select {...p} {...register('marital_status')}>
                    {(['NEVER_MARRIED', 'DIVORCED', 'WIDOWED', 'AWAITING_DIVORCE'] as const).map((m) => <option key={m} value={m}>{t(`candidate.marital.${m}`)}</option>)}
                  </Select>
                )}
              </Field>
              <Field label={t('candidate.height')} error={errors.height_cm && '120–230'}>
                {(p) => <Input {...p} type="number" inputMode="numeric" {...register('height_cm')} />}
              </Field>
            </div>
            {showMaterialNote ? <p className="hint">{t('candidate.materialChange')}</p> : null}
            <div className="grid-2">
              <Field label={t('candidate.district')}>
                {(p) => (
                  <Select {...p} {...register('district')}>
                    <option value="">—</option>
                    {DISTRICTS.map((d) => <option key={d} value={d}>{d}</option>)}
                  </Select>
                )}
              </Field>
              <Field label={t('candidate.state')}>{(p) => <Input {...p} {...register('state')} />}</Field>
            </div>
            <Field label={t('candidate.bio')} hint={t('candidate.bioHint')}>{(p) => <Textarea {...p} maxLength={1000} {...register('bio')} />}</Field>
            <Field label={t('candidate.familySummary')}>{(p) => <Textarea {...p} maxLength={600} {...register('family_summary')} />}</Field>
          </>
        ) : null}

        {show(2) ? (
          <>
            {!wiz ? <hr className="divider" /> : null}
            <div className="stack-sm" style={{ gap: 2 }}>
              {!wiz ? <h3>{t('candidate.customs')}</h3> : null}
              <p className="hint">{t('candidate.customsHint')}</p>
            </div>
            <div className="grid-2">
              <Field label={t('candidate.gotram')} optional>{(p) => <Input {...p} {...register('gotram')} />}</Field>
              <Field label={t('candidate.star')} optional>{(p) => <Input {...p} {...register('star')} />}</Field>
            </div>
            <Field label={t('candidate.raasi')} optional>{(p) => <Input {...p} {...register('raasi')} />}</Field>
          </>
        ) : null}

        {wiz && wizardStep === 3 ? (
          <div className="card stack">
            <dl className="kv">
              <dt>{t('candidate.firstName')}</dt><dd>{v.first_name}</dd>
              <dt>{t('candidate.gender')}</dt><dd>{t(`candidate.genders.${v.gender}`)}</dd>
              <dt>{t('candidate.dob')}</dt><dd className="num">{v.dob}</dd>
              <dt>{t('candidate.maritalStatus')}</dt><dd>{t(`candidate.marital.${v.marital_status}`)}</dd>
              <dt>{t('candidate.education')}</dt><dd>{v.education || '—'}</dd>
              <dt>{t('candidate.profession')}</dt><dd>{v.profession || '—'}</dd>
              <dt>{t('candidate.city')}</dt><dd>{[v.city, v.district].filter(Boolean).join(', ') || '—'}</dd>
            </dl>
            <p className="hint">{t('candidate.draftNote')}</p>
          </div>
        ) : null}
      </fieldset>
      {footer ? footer(button) : button}
    </form>
  );
}
