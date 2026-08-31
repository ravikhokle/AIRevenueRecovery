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

  // 1. Run Automated AI Workflow
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

  // 2. Submit Human-in-the-Loop Operator Decision
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
        text: `Human review decision recorded: ${decision} (Verified: ${data.actionVerified ? "Yes" : "No"})`,
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
      <div className="flex gap-2">
        <button
          onClick={handleRun}
          disabled={loading}
          className="btn btn-secondary btn-sm"
        >
          {loading ? (
            <>
              <span className="spinner" />
              Processing...
            </>
          ) : (
            <>
              <svg
                className="w-3.5 h-3.5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 10V3L4 14h7v7l9-11h-7z"
                />
              </svg>
              Run AI Analysis
            </>
          )}
        </button>

        <button
          onClick={() => setShowReviewModal(!showReviewModal)}
          className="btn btn-primary btn-sm"
        >
          <svg
            className="w-3.5 h-3.5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          Human Decision
        </button>
      </div>

      {showReviewModal && (
        <div className="p-3 bg-surface border border-border rounded-lg shadow-xl mt-2 w-80 flex flex-col gap-2.5 z-10">
          <div className="text-xs font-semibold text-primary">
            Operator Review & Execution
          </div>
          <p className="text-xs text-secondary">
            Explicitly authorize or reject recovery action with full operator attribution.
          </p>
          <input
            type="text"
            placeholder="Optional review notes..."
            value={operatorNotes}
            onChange={(e) => setOperatorNotes(e.target.value)}
            className="w-full px-2 py-1 text-xs bg-raised border border-border rounded text-primary"
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
          className={`text-xs px-2.5 py-1 rounded ${
            message.type === "success"
              ? "bg-green-dim text-green border border-green-dim"
              : "bg-red-dim text-red border border-red-dim"
          }`}
        >
          {message.text}
        </div>
      )}
    </div>
  );
}
