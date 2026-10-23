// Districts shown first are the Indhur (Nizamabad) region; others allow diaspora families.
export const DISTRICTS = [
  'Nizamabad', 'Kamareddy', 'Nirmal', 'Jagtial', 'Adilabad', 'Karimnagar', 'Medak', 'Sangareddy',
  'Hyderabad', 'Rangareddy', 'Medchal-Malkajgiri', 'Other (Telangana)', 'Other (India)', 'Outside India',
];

export const EVIDENCE_TYPES = ['REFERENCE_LETTER', 'COMMUNITY_DOCUMENT', 'EDUCATION', 'EMPLOYMENT', 'OTHER'] as const;
export const MAX_EVIDENCE_BYTES = 5 * 1024 * 1024;
export const MAX_PHOTO_BYTES = 3 * 1024 * 1024;
