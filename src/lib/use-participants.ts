import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database, Json } from "@/integrations/supabase/types";
import type { ParticipantStatus, AttendeeType } from "./participant-constants";

export type ParticipantRow = Database["public"]["Tables"]["event_participants"]["Row"];
export type PersonRow = Database["public"]["Tables"]["people"]["Row"];

export interface ParticipantWithRelations extends ParticipantRow {
  people: PersonRow | null;
  event_sessions: { id: string; name: string; starts_at: string; capacity: number } | null;
  events: { id: string; name: string } | null;
  form_submissions: { id: string; payload: unknown } | null;
}

export interface ParticipantFilters {
  eventId?: string;
  sessionId?: string;
  importBatchId?: string;
  statuses?: ParticipantStatus[];
  attendeeTypes?: AttendeeType[];
  search?: string;
  city?: string;
  province?: string;
  gender?: string;
  minAge?: number;
  maxAge?: number;
  blockedOnly?: boolean;
  fromDate?: string;
  toDate?: string;
}

const PAGE_SIZE = 500;

export function useParticipants(filters: ParticipantFilters) {
  const query = useInfiniteQuery({
    queryKey: ["participants", filters],
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      const from = (pageParam as number) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      let q = supabase
        .from("event_participants")
        .select(
          "*, people(*), event_sessions(id, name, starts_at, capacity), events(id, name), form_submissions(id, payload)",
          { count: "exact" },
        )
        .order("created_at", { ascending: false })
        .range(from, to);

      if (filters.eventId) q = q.eq("event_id", filters.eventId);
      if (filters.sessionId) q = q.eq("session_id", filters.sessionId);
      if (filters.importBatchId) q = q.eq("import_batch_id", filters.importBatchId);
      if (filters.statuses?.length) q = q.in("status", filters.statuses);
      if (filters.attendeeTypes?.length) q = q.in("attendee_type", filters.attendeeTypes);
      if (filters.fromDate) q = q.gte("created_at", filters.fromDate);
      if (filters.toDate) q = q.lte("created_at", filters.toDate);

      const { data, error, count } = await q;
      if (error) throw error;
      return {
        rows: (data ?? []) as unknown as ParticipantWithRelations[],
        totalCount: count ?? 0,
        nextPage: (data?.length ?? 0) === PAGE_SIZE ? (pageParam as number) + 1 : undefined,
      };
    },
    getNextPageParam: (lastPage) => lastPage.nextPage,
  });

  const allRows = (query.data?.pages ?? []).flatMap((p) => p.rows);
  const totalCount = query.data?.pages[0]?.totalCount ?? 0;

  // Apply client-side filters that depend on related person fields.
  let rows = allRows;
  {
    if (filters.search) {
      const s = filters.search.toLowerCase();
      rows = rows.filter((r) => {
        const p = r.people;
        if (!p) return false;
        return [p.first_name, p.last_name, p.email, p.phone, p.dni]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(s));
      });
    }
    if (filters.city) rows = rows.filter((r) => r.people?.city?.toLowerCase() === filters.city!.toLowerCase());
    if (filters.province) rows = rows.filter((r) => r.people?.province?.toLowerCase() === filters.province!.toLowerCase());
    if (filters.gender) rows = rows.filter((r) => r.people?.gender === filters.gender);
    if (filters.blockedOnly) rows = rows.filter((r) => r.people?.is_blocked);
    if (filters.minAge != null || filters.maxAge != null) {
      rows = rows.filter((r) => {
        const birth = r.people?.birth_date;
        if (!birth) return false;
        const age = Math.floor((Date.now() - new Date(birth).getTime()) / (365.25 * 86400000));
        if (filters.minAge != null && age < filters.minAge) return false;
        if (filters.maxAge != null && age > filters.maxAge) return false;
        return true;
      });
    }
  }

  return {
    data: rows,
    loadedCount: allRows.length,
    totalCount,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isFetchingNextPage: query.isFetchingNextPage,
    hasNextPage: !!query.hasNextPage,
    fetchNextPage: query.fetchNextPage,
    error: query.error,
  };
}

export function useParticipant(id: string | undefined) {
  return useQuery({
    queryKey: ["participant", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("event_participants")
        .select(
          "*, people(*), event_sessions(id, name, starts_at, ends_at, capacity, location_name), events(id, name, slug), form_submissions(id, payload, submitted_at)",
        )
        .eq("id", id!)
        .single();
      if (error) throw error;
      return data as unknown as ParticipantWithRelations & {
        events: { id: string; name: string; slug: string | null } | null;
      };
    },
  });
}

export function useParticipantCompanions(participantId: string | undefined) {
  return useQuery({
    queryKey: ["companions", participantId],
    enabled: !!participantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("companions")
        .select("*")
        .eq("participant_id", participantId!);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useParticipantConsents(participantId: string | undefined) {
  return useQuery({
    queryKey: ["consents", participantId],
    enabled: !!participantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("consent_records")
        .select("*, legal_texts(title, version, kind)")
        .eq("participant_id", participantId!);
      if (error) throw error;
      return data ?? [];
    },
  });
}

async function logAudit(action: string, participantId: string, eventId: string | null, changes: Record<string, unknown>) {
  const { data: userData } = await supabase.auth.getUser();
  await supabase.from("audit_logs").insert({
    action,
    entity_type: "event_participant",
    entity_id: participantId,
    event_id: eventId,
    actor_id: userData.user?.id ?? null,
    actor_email: userData.user?.email ?? null,
    changes: changes as Json,
  });
}

interface UpdateArgs {
  id: string;
  eventId: string;
  patch: Database["public"]["Tables"]["event_participants"]["Update"];
  action?: string;
}

export function useUpdateParticipant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, eventId, patch, action }: UpdateArgs) => {
      const { data, error } = await supabase
        .from("event_participants")
        .update(patch)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      await logAudit(action ?? "participant.update", id, eventId, patch as Record<string, unknown>);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["participants"] });
      qc.invalidateQueries({ queryKey: ["participant"] });
      qc.invalidateQueries({ queryKey: ["session-stats"] });
    },
  });
}

interface BulkArgs {
  ids: string[];
  eventId: string;
  patch: Database["public"]["Tables"]["event_participants"]["Update"];
  action: string;
}

export function useBulkUpdateParticipants() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ ids, eventId, patch, action }: BulkArgs) => {
      const { error } = await supabase
        .from("event_participants")
        .update(patch)
        .in("id", ids);
      if (error) throw error;
      const { data: userData } = await supabase.auth.getUser();
      await supabase.from("audit_logs").insert(
        ids.map((id) => ({
          action,
          entity_type: "event_participant",
          entity_id: id,
          event_id: eventId,
          actor_id: userData.user?.id ?? null,
          actor_email: userData.user?.email ?? null,
          changes: patch as unknown as Json,
        })),
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["participants"] });
      qc.invalidateQueries({ queryKey: ["session-stats"] });
    },
  });
}

export function useBlockPerson() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ personId, blocked, reason }: { personId: string; blocked: boolean; reason?: string }) => {
      const { error } = await supabase
        .from("people")
        .update({ is_blocked: blocked, blocked_reason: blocked ? reason ?? null : null })
        .eq("id", personId);
      if (error) throw error;
      const { data: userData } = await supabase.auth.getUser();
      await supabase.from("audit_logs").insert({
        action: blocked ? "person.block" : "person.unblock",
        entity_type: "person",
        entity_id: personId,
        actor_id: userData.user?.id ?? null,
        actor_email: userData.user?.email ?? null,
        changes: { is_blocked: blocked, reason: reason ?? null } as Json,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["participants"] });
      qc.invalidateQueries({ queryKey: ["participant"] });
    },
  });
}

export function useUpdatePerson() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Database["public"]["Tables"]["people"]["Update"] }) => {
      const { data, error } = await supabase.from("people").update(patch).eq("id", id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["participants"] });
      qc.invalidateQueries({ queryKey: ["participant"] });
    },
  });
}

/**
 * Detects possible duplicates within the loaded list based on shared email or DNI.
 */
export function findDuplicateIds(rows: ParticipantWithRelations[]): Set<string> {
  const emailMap = new Map<string, string[]>();
  const dniMap = new Map<string, string[]>();
  for (const r of rows) {
    const e = r.people?.email?.toLowerCase().trim();
    const d = r.people?.dni?.toLowerCase().trim();
    if (e) emailMap.set(e, [...(emailMap.get(e) ?? []), r.id]);
    if (d) dniMap.set(d, [...(dniMap.get(d) ?? []), r.id]);
  }
  const dups = new Set<string>();
  for (const ids of [...emailMap.values(), ...dniMap.values()]) {
    if (ids.length > 1) ids.forEach((i) => dups.add(i));
  }
  return dups;
}

export function hasPhoto(payload: unknown): boolean {
  if (!payload || typeof payload !== "object") return false;
  const p = payload as Record<string, unknown>;
  return Boolean(p.photo_url || p.photo_path || p.photoUrl);
}