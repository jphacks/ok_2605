import { nextScheduledDose, type DailyMedication } from './dose-record.ts';
import { isMedicationActiveOnDay, type Medication } from './medication.ts';

type Box = { id: number; name: string; medications: { id: number }[] };

export function groupScheduledDoses(schedule: DailyMedication[], boxes: Box[]) {
  const groups = new Map<string, { key: string; box: Box | undefined; items: DailyMedication[] }>();
  for (const item of schedule) {
    const box = boxes.find((box) => box.medications.some((medication) => medication.id === item.medication.id));
    const key = `${item.scheduledDay}:${item.medication.doseTime}:${box ? `box-${box.id}` : `med-${item.medication.id}`}`;
    const group = groups.get(key);
    if (group) group.items.push(item);
    else groups.set(key, { key, box, items: [item] });
  }
  return [...groups.values()];
}

// Select the next box/time group without bringing expired occurrences back.
export function nextScheduledDoseGroup(schedule: DailyMedication[], medications: Medication[], boxes: Box[], now: Date) {
  const next = nextScheduledDose(schedule, medications, now);
  if (!next) return null;
  const box = boxes.find((box) => box.medications.some((medication) => medication.id === next.medication.id));
  const members = medications.filter((medication) => {
    if (medication.id === next.medication.id) return true;
    if (!box?.medications.some((member) => member.id === medication.id)
      || medication.doseTime !== next.medication.doseTime || !isMedicationActiveOnDay(medication, next.day)) return false;
    const occurrence = schedule.find((item) => item.medication.id === medication.id && item.scheduledDay === next.day);
    // For future occurrences not yet in the daily schedule, use each medicine's next date.
    return occurrence ? occurrence.status !== 'taken'
      : nextScheduledDose(schedule.filter((item) => item.medication.id === medication.id), [medication], now)?.day === next.day;
  });
  return { ...next, medications: members, box };
}
