import { unstable_noStore as noStore } from "next/cache";

import type { ScheduleTimeBlock } from "@/features/appointments/time-blocks/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { addDaysToDateString, localDateTimeToUtcIso } from "@/lib/timezone";
import { isValidUuid } from "@/lib/security/uuid";

function getDayBoundsUtc(date: string, timeZone: string) {
  const start = localDateTimeToUtcIso(date, "00:00", timeZone);
  const end = localDateTimeToUtcIso(addDaysToDateString(date, 1), "00:00", timeZone);
  return { start, end };
}

export async function getTimeBlocksForDay(
  companyId: string,
  date: string,
  timeZone: string,
  employeeId?: string,
): Promise<ScheduleTimeBlock[]> {
  if (!isValidUuid(companyId) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return [];
  }

  noStore();
  const supabase = await createSupabaseServerClient();
  const { start, end } = getDayBoundsUtc(date, timeZone);

  let query = supabase
    .from("schedule_time_blocks")
    .select("id, employee_id, block_start, block_end, reason, employees(name)")
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .gte("block_start", start)
    .lt("block_start", end)
    .order("block_start", { ascending: true });

  if (employeeId && isValidUuid(employeeId)) {
    query = query.or(`employee_id.is.null,employee_id.eq.${employeeId}`);
  }

  const { data, error } = await query;

  if (error || !data) {
    return [];
  }

  return data.map((row) => {
    const employee = row.employees as unknown as { name: string } | null;
    return {
      id: row.id,
      employee_id: row.employee_id,
      block_start: row.block_start,
      block_end: row.block_end,
      reason: row.reason,
      employeeName: employee?.name ?? null,
    };
  });
}

export async function getTimeBlocksForSlotCheck(
  companyId: string,
  employeeId: string,
  date: string,
  timeZone: string,
): Promise<Array<{ block_start: string; block_end: string; employee_id: string | null }>> {
  const blocks = await getTimeBlocksForDay(companyId, date, timeZone, employeeId);
  return blocks.map(({ block_start, block_end, employee_id }) => ({
    block_start,
    block_end,
    employee_id,
  }));
}
