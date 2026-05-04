import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { ArrowRight, QrCode, Search } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api/client";
import { Button, Card, Section } from "../components/ui";
import { StatusPill } from "../components/ui/Pill";
import { ImageComparePanel } from "../components/ImageComparePanel";
import { useToast } from "../components/Toast";
import type { BarcodeLabel, FoundItem, MatchCandidate } from "../types";

function describeError(error: unknown, fallback: string): string {
  if (axios.isAxiosError(error)) {
    const detail = error.response?.data?.detail;
    if (typeof detail === "string") return detail;
    if (error.message) return error.message;
  }
  return fallback;
}

export function FoundItemDetailPage() {
  const { id } = useParams();
  const client = useQueryClient();
  const toast = useToast();
  const { data: item, isLoading } = useQuery({
    queryKey: ["found-item", id],
    queryFn: async () => (await api.get<FoundItem>(`/found-items/${id}`)).data,
  });
  const { data: allMatches = [] } = useQuery({
    queryKey: ["matches"],
    queryFn: async () => (await api.get<MatchCandidate[]>("/matches")).data,
  });
  const matches = allMatches
    .filter((match) => match.found_item_id === Number(id))
    .sort((a, b) => b.match_score - a.match_score);

  const runMatching = useMutation({
    mutationFn: async () => (await api.post<MatchCandidate[]>(`/found-items/${id}/run-matching`)).data,
    onSuccess: (data) => {
      client.invalidateQueries({ queryKey: ["matches"] });
      toast.push(`Matching ran — ${Array.isArray(data) ? data.length : 0} candidates returned.`, "success");
    },
    onError: (error) => toast.push(describeError(error, "Could not run matching."), "error"),
  });
  const label = useMutation({
    mutationFn: async () => (await api.post<BarcodeLabel>(`/found-items/${id}/labels`)).data,
    onSuccess: (data) => {
      client.invalidateQueries({ queryKey: ["found-item", id] });
      toast.push(`QR label ${data.label_code} ready.`, "success");
    },
    onError: (error) => toast.push(describeError(error, "Could not generate QR label."), "error"),
  });

  if (isLoading) return <p className="text-sm text-ink-500">Loading found item...</p>;
  if (!item) return <p className="text-sm text-ink-500">Found item not available.</p>;

  return (
    <Section
      kicker="Found item"
      title={item.item_title}
      action={
        <Button onClick={() => runMatching.mutate()} loading={runMatching.isPending} leftIcon={<Search className="h-4 w-4" />}>
          {runMatching.isPending ? "Running..." : "Run matching"}
        </Button>
      }
    >
      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          <Card>
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill value={item.status} />
              <StatusPill value={item.risk_level} />
            </div>
            <p className="mt-4 text-sm leading-relaxed text-ink-700">{item.raw_description}</p>
            {item.ai_clean_description ? (
              <>
                <p className="mt-3 text-[11px] font-semibold uppercase tracking-wider text-ink-500">AI description</p>
                <p className="text-sm text-ink-800">{item.ai_clean_description}</p>
              </>
            ) : null}
          </Card>

          {/* Side-by-side: this item's photo vs matched lost-report photos */}
          <Card className="overflow-hidden p-0" padded={false}>
            <div className="flex items-center justify-between border-b border-ink-200/60 px-5 py-4">
              <div>
                <p className="font-display text-base font-semibold tracking-tight text-ink-900">
                  Matched lost reports {matches.length > 0 ? <span className="text-ink-400">({matches.length})</span> : null}
                </p>
                <p className="text-xs text-ink-500">
                  Found item on the right, passenger's lost-report photo on the left for each candidate.
                </p>
              </div>
              {matches.length ? (
                <Link to="/staff/matches" className="focus-ring inline-flex items-center gap-1 text-xs font-semibold text-navy-700 hover:underline">
                  Open in Match Review <ArrowRight className="h-3 w-3" />
                </Link>
              ) : null}
            </div>

            {matches.length === 0 ? (
              <div className="px-5 py-8 text-center">
                {item.image_blob_url ? (
                  <ImageComparePanel
                    foundImageUrl={item.image_blob_url}
                    lostImageUrl={null}
                    foundLabel={item.item_title}
                    lostLabel="No matching lost report yet"
                  />
                ) : (
                  <p className="text-sm text-ink-500">
                    No matches yet. Click <span className="font-semibold text-ink-800">Run matching</span> to compare against open lost reports.
                  </p>
                )}
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
                            {match.lost_report?.item_title ?? "Lost report"}{" "}
                            {match.lost_report?.report_code ? (
                              <span className="font-mono text-xs text-navy-700">{match.lost_report.report_code}</span>
                            ) : null}
                          </p>
                          <StatusPill value={match.confidence_level} />
                          <StatusPill value={match.status} />
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
                        lostImageUrl={match.lost_report?.proof_blob_url}
                        foundImageUrl={item.image_blob_url}
                        lostLabel={
                          match.lost_report?.report_code
                            ? `Lost report ${match.lost_report.report_code}`
                            : "Passenger's photo"
                        }
                        foundLabel={item.item_title}
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
        </div>

        <aside className="space-y-3">
          <Card>
            <p className="font-display text-sm font-semibold tracking-tight text-ink-900">Item details</p>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between gap-3"><dt className="text-ink-500">Category</dt><dd className="text-ink-800">{item.category ?? "—"}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-ink-500">Color</dt><dd className="text-ink-800">{item.color ?? "—"}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-ink-500">Found at</dt><dd className="text-ink-800">{item.found_location ?? "—"}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-ink-500">Storage</dt><dd className="text-ink-800">{item.storage_location ?? "—"}</dd></div>
            </dl>
          </Card>

          <Card>
            <p className="font-display text-sm font-semibold tracking-tight text-ink-900">QR label</p>
            <p className="mt-1 text-xs text-ink-500">Generate a QR sticker to attach to this item.</p>
            <Button
              variant="gold"
              size="sm"
              fullWidth
              className="mt-3"
              loading={label.isPending}
              onClick={() => label.mutate()}
              leftIcon={<QrCode className="h-3.5 w-3.5" />}
            >
              {label.isPending ? "Generating..." : "Generate QR label"}
            </Button>
            {label.data ? (
              <div className="mt-3 rounded-2xl border border-ink-200 p-3">
                <img
                  src={`${api.defaults.baseURL}/labels/${label.data.label_code}/qr`}
                  alt={`QR label ${label.data.label_code}`}
                  className="mx-auto h-40 w-40"
                />
                <p className="mt-2 text-center font-mono text-xs font-semibold text-ink-700">{label.data.label_code}</p>
              </div>
            ) : null}
          </Card>

          <div className="grid gap-2">
            <Link
              className="focus-ring inline-flex items-center justify-center rounded-2xl border border-ink-200 bg-white px-3 py-2 text-sm font-semibold text-ink-800 hover:bg-ink-50"
              to={`/staff/found/${item.id}/custody`}
            >
              Custody timeline
            </Link>
            <Link
              className="focus-ring inline-flex items-center justify-center rounded-2xl border border-ink-200 bg-white px-3 py-2 text-sm font-semibold text-ink-800 hover:bg-ink-50"
              to="/staff/scan"
            >
              Open QR scanner
            </Link>
          </div>
        </aside>
      </div>
    </Section>
  );
}
