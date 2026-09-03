"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface RunWorkflowButtonProps {
  transactionId: string;
  status: string;
  isEscalated?: boolean;
}

export function RunWorkflowButton({
  transactionId,
  status,
  isEscalated = false,
}: RunWorkflowButtonProps) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [operatorNotes, setOperatorNotes] = useState("");
  const [showReviewModal, setShowReviewModal] = useState(false);
  const router = useRouter();

  const handleRun = async () => {
    setLoading(true);
    setMessage(null);

    try {
      const res = await fetch("/api/workflow/recovery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transactionId }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Workflow failed");
      }

      setMessage({
        type: "success",
        text: `Workflow completed: ${data.status} (Action: ${data.result?.recommendedAction})`,
      });
      router.refresh();
    } catch (error) {
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "Workflow failed to execute",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleHumanReview = async (decision: "APPROVE" | "REJECT") => {
    setLoading(true);
    setMessage(null);

    try {
      const res = await fetch("/api/workflow/human-review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transactionId,
          decision,
          operatorId: "merchant_ops_lead",
          notes: operatorNotes || `Operator marked ${decision}`,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || data.error || "Human review submission failed");
      }

      setMessage({
        type: "success",
        text: `Human review decision recorded: ${decision} (Verified: ${
          data.actionVerified ? "Yes" : "No"
        })`,
      });
      setShowReviewModal(false);
      router.refresh();
    } catch (error) {
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "Human review failed",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-2 items-end">
      <div className="flex gap-2 flex-wrap justify-end">
        <button
          onClick={handleRun}
          disabled={loading}
          className="btn btn-secondary btn-sm"
          title={`Run AI recovery workflow for ${status.toLowerCase()} transaction`}
        >
          {loading ? (
            <>
              <span className="spinner" />
              Processing...
            </>
          ) : (
            "Run AI Analysis"
          )}
        </button>

        <button
          onClick={() => setShowReviewModal(!showReviewModal)}
          className="btn btn-primary btn-sm"
          title={isEscalated ? "Review escalated case" : "Record operator decision"}
        >
          Human Decision
        </button>
      </div>

      {showReviewModal && (
        <div className="panel-soft mt-2 w-80 p-3 shadow-lg flex flex-col gap-2.5 z-10">
          <div className="text-xs font-bold text-slate-100">
            Operator Review & Execution
          </div>
          <p className="text-xs text-slate-400">
            Authorize or reject the recovery action with operator attribution.
          </p>
          <input
            type="text"
            placeholder="Optional review notes"
            value={operatorNotes}
            onChange={(e) => setOperatorNotes(e.target.value)}
            className="input-text w-full text-xs"
          />
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => handleHumanReview("REJECT")}
              disabled={loading}
              className="btn btn-danger btn-sm"
            >
              Reject Case
            </button>
            <button
              onClick={() => handleHumanReview("APPROVE")}
              disabled={loading}
              className="btn btn-primary btn-sm"
            >
              Approve Recovery
            </button>
          </div>
        </div>
      )}

      {message && (
        <div
          className={`text-xs px-3 py-2 rounded-md border ${
            message.type === "success"
              ? "bg-emerald-950/40 text-emerald-400 border-emerald-500/40"
              : "bg-rose-950/40 text-rose-300 border-rose-800/60"
          }`}
        >
          {message.text}
        </div>
      )}
    </div>
  );
}
