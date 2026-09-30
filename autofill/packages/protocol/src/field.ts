import { z } from 'zod';

/** What a control looks like to the planner. Deliberately coarser than the DOM. */
export const FieldKind = z.enum([
  'text',
  'email',
  'tel',
  'url',
  'number',
  'textarea',
  'select',
  'combobox',
  'file',
  'checkbox-group',
  'radio-group',
  'other',
]);
export type FieldKind = z.infer<typeof FieldKind>;

export const FieldOption = z.object({
  value: z.string(),
  label: z.string(),
});
export type FieldOption = z.infer<typeof FieldOption>;

/**
 * One fillable control as the extension scraped it. `id` is opaque and only
 * meaningful to the extension: it is echoed back on the matching plan entry.
 */
export const FieldDescriptor = z.object({
  id: z.string().min(1),
  label: z.string(),
  key: z.string(),
  kind: FieldKind,
  required: z.boolean(),
  options: z.array(FieldOption).optional(),
  optionsHidden: z.boolean().optional(),
});
export type FieldDescriptor = z.infer<typeof FieldDescriptor>;
