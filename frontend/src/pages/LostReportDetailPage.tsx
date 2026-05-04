import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { ArrowRight, Search } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api/client";
import { Button, Card, Section } from "../components/ui";
import { StatusPill } from "../components/ui/Pill";
import { ImageComparePanel } from "../components/ImageComparePanel";
import { useToast } from "../components/Toast";
import type { LostReport, MatchCandidate } from "../types";

function describeError(error: unknown, fallback: string): string {
  if (axios.isAxiosError(error)) {
    const detail = error.response?.data?.detail;
    if (typeof detail === "string") return detail;
    if (error.message) return error.message;
  }
  return fallback;
}

export function LostReportDetailPage() {
  const { id } = useParams();
  const client = useQueryClient();
  const toast = useToast();
  const { data: report, isLoading } = useQuery({
    queryKey: ["lost-report", id],
    queryFn: async () => (await api.get<LostReport>(`/lost-reports/${id}`)).data,
  });
  // Pull all matches once and filter client-side — avoids needing a per-report endpoint.
  const { data: allMatches, isLoading: matchesLoading } = useQuery({
    queryKey: ["matches"],
    queryFn: async () => (await api.get<MatchCandidate[]>("/matches")).data,
    refetchOnMount: "always",
    staleTime: 0,
  });
  const matches = (allMatches ?? [])
    .filter((match) => match.lost_report_id === Number(id))
    .sort((a, b) => b.match_score - a.match_score);

  const runMatching = useMutation({
    mutationFn: async () => (await api.post<MatchCandidate[]>(`/lost-reports/${id}/run-matching`)).data,
    onSuccess: (data) => {
      client.invalidateQueries({ queryKey: ["matches"] });
      toast.push(`Matching ran — ${Array.isArray(data) ? data.length : 0} candidates returned.`, "success");
    },
    onError: (error) => toast.push(describeError(error, "Could not run matching."), "error"),
  });

  if (isLoading) return <p className="text-sm text-ink-500">Loading lost report...</p>;
  if (!report) return <p className="text-sm text-ink-500">Lost report not available.</p>;

  return (
    <Section
      kicker={report.report_code}
      title={report.item_title}
      action={
        <Button onClick={() => runMatching.mutate()} loading={runMatching.isPending} leftIcon={<Search className="h-4 w-4" />}>
          {runMatching.isPending ? "Running..." : "Run matching"}
        </Button>
      }
    >
      {/* Report details */}
      <Card>
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill value={report.status} />
        </div>
        <p className="mt-4 text-sm leading-relaxed text-ink-700">{report.raw_description}</p>
        <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div><dt className="text-[11px] font-semibold uppercase tracking-wider text-ink-500">Category</dt><dd className="mt-0.5 text-ink-800">{report.category ?? "—"}</dd></div>
          <div><dt className="text-[11px] font-semibold uppercase tracking-wider text-ink-500">Color</dt><dd className="mt-0.5 text-ink-800">{report.color ?? "—"}</dd></div>
          <div><dt className="text-[11px] font-semibold uppercase tracking-wider text-ink-500">Location</dt><dd className="mt-0.5 text-ink-800">{report.lost_location ?? "—"}</dd></div>
          <div><dt className="text-[11px] font-semibold uppercase tracking-wider text-ink-500">Flight</dt><dd className="mt-0.5 text-ink-800">{report.flight_number ?? "—"}</dd></div>
        </dl>
      </Card>

      {/* Match candidates with side-by-side images */}
      <Card className="overflow-hidden p-0" padded={false}>
        <div className="flex items-center justify-between border-b border-ink-200/60 px-5 py-4">
          <div>
            <p className="font-display text-base font-semibold tracking-tight text-ink-900">
              Matched found items {matches.length > 0 ? <span className="text-ink-400">({matches.length})</span> : null}
            </p>
            <p className="text-xs text-ink-500">
              Passenger's photo on the left, candidate found item on the right. Open Match Review to act on any candidate.
            </p>
          </div>
          {matches.length ? (
            <Link to="/staff/matches" className="focus-ring inline-flex items-center gap-1 text-xs font-semibold text-navy-700 hover:underline">
              Open in Match Review <ArrowRight className="h-3 w-3" />
            </Link>
          ) : null}
        </div>

        {matchesLoading ? (
          <div className="px-5 py-8 text-center text-sm text-ink-500">Loading matches…</div>
        ) : matches.length === 0 ? (
          <div className="px-5 py-8 text-center">
            <p className="text-sm text-ink-600">
              No matches yet. Click <span className="font-semibold text-ink-900">Run matching</span> to score this report against current found items.
            </p>
            {report.proof_blob_url ? (
              <div className="mx-auto mt-5 max-w-sm">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-ink-500">Passenger's proof photo</p>
                <img
                  src={report.proof_blob_url}
                  alt="Lost report proof"
                  className="mx-auto w-full rounded-2xl border border-ink-200 object-contain"
                />
              </div>
            ) : null}
          </div>
        ) : (
          <div className="divide-y divide-ink-100">
            {matches.map((match) => {
              const score = Math.round(match.match_score);
              const scoreTone = score >= 85 ? "text-success-700" : score >= 70 ? "text-warn-700" : "text-ink-600";
              const ringTone = score >= 85 ? "ring-success-500/30" : score >= 70 ? "ring-warn-500/30" : "ring-ink-300";
              const imageScore = (match.evidence_spans_json as { image_score?: number } | undefined)?.image_score;
              return (
                <div key={match.id} className="px-5 py-5">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-display text-sm font-semibold tracking-tight text-ink-900">
                        {match.found_item?.item_title ?? "Found item"}
                      </p>
                      <StatusPill value={match.confidence_level} />
                      <StatusPill value={match.status} />
                      <StatusPill value={match.found_item?.risk_level} />
                      {imageScore !== undefined ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2 py-0.5 text-[11px] font-semibold text-violet-700 ring-1 ring-violet-200/60">
                          Image {Math.round(imageScore)}/100
                        </span>
                      ) : null}
                    </div>
                    <div className={`grid h-12 w-12 place-items-center rounded-2xl bg-white ring-2 ${ringTone}`}>
                      <span className={`font-display text-lg font-bold tabular-nums ${scoreTone}`}>{score}</span>
                    </div>
                  </div>

                  <ImageComparePanel
                    lostImageUrl={report.proof_blob_url}
                    foundImageUrl={match.found_item?.image_blob_url}
                    lostLabel={`Lost report ${report.report_code}`}
                    foundLabel={match.found_item?.item_title ?? "Found item"}
                  />

                  {match.ai_match_summary ? (
                    <p className="mt-3 whitespace-pre-line rounded-2xl bg-ink-50/60 px-3 py-2 text-xs leading-relaxed text-ink-700">
                      {match.ai_match_summary}
                    </p>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </Section>
  );
}
