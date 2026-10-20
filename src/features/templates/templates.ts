import type { ApplicationTemplate } from "@/api/stubs/extras";
import { type ApplicationDraft } from "@/domain/application-form";
import { isoDate } from "@/domain/dates";
import { GUARANTEE_TYPE_LABELS, LAW_KIND_LABELS } from "@/domain/types";

/** Встроенные шаблоны прототипа (TPL0). */
export const BUILT_IN_TEMPLATES: ApplicationTemplate[] = [
  {
    id: "b1",
    name: "44-ФЗ · участие в закупке",
    builtIn: true,
    fields: { law: "44_fz", guaranteeType: "participation", validDays: 90 },
  },
  {
    id: "b2",
    name: "223-ФЗ · участие в закупке",
    builtIn: true,
    fields: { law: "223_fz", guaranteeType: "participation", validDays: 90 },
  },
  { id: "b3", name: "БГ по НДС", builtIn: true, fields: { law: "vat", validDays: 365 } },
  {
    id: "b4",
    name: "Коммерческая · аванс",
    builtIn: true,
    fields: { law: "commercial", guaranteeType: "advance", validDays: 180 },
  },
];

export function templateSummary(t: ApplicationTemplate): string {
  const f = t.fields;
  const parts = [
    f.law ? LAW_KIND_LABELS[f.law] : null,
    f.law !== "vat" && f.guaranteeType ? GUARANTEE_TYPE_LABELS[f.guaranteeType] : null,
  ];
  if (f.validDays) parts.push(`${f.validDays} дн.`);
  return parts.filter(Boolean).join(" · ");
}

export function applyTemplate(
  draft: ApplicationDraft,
  t: ApplicationTemplate,
  today = new Date(),
): ApplicationDraft {
  const { validDays, ...fields } = t.fields;
  const next: ApplicationDraft = { ...draft, ...fields };
  if (validDays) {
    next.validFrom = isoDate(today);
    next.validTo = isoDate(new Date(today.getTime() + (validDays - 1) * 864e5));
  }
  return next;
}
