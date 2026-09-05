"use client";

import React, { useState } from "react";
import type { DashboardChartData, ChartSegment } from "@/lib/dashboard/data";
import { formatRupeesLong } from "@/app/components/utils";

interface DashboardChartsProps {
  data: DashboardChartData;
  className?: string;
}

export function DashboardCharts({ data, className = "mb-0" }: DashboardChartsProps) {
  const [hoveredSegment, setHoveredSegment] = useState<ChartSegment | null>(null);
  const [activeTab, setActiveTab] = useState<"actions" | "methods">("actions");

  const { donut, actions, methods } = data;

  // Donut geometry: sleek, proportional, and clean
  const size = 150;
  const strokeWidth = 18;
  const radius = (size - strokeWidth) / 2;
  const center = size / 2;
  const circumference = 2 * Math.PI * radius;

  let accumulatedPercent = 0;
  const donutArcs = donut.segments.map((seg) => {
    const strokeDasharray = `${(seg.pct / 100) * circumference} ${circumference}`;
    const strokeDashoffset = -((accumulatedPercent / 100) * circumference);
    accumulatedPercent += seg.pct;

    return {
      ...seg,
      strokeDasharray,
      strokeDashoffset,
    };
  });

  const activeBars = activeTab === "actions" ? actions : methods;

  return (
    <div className={`grid grid-cols-1 lg:grid-cols-12 gap-5 ${className}`}>
      {/* 1. Left Card: Revenue Breakdown */}
      <div className="card lg:col-span-5 flex flex-col">
        <div className="card-header">
          <span className="card-title">Revenue Breakdown</span>
          <span className="badge badge-neutral text-xs">
            {donut.recoveryRate}% Overall
          </span>
        </div>

        <div className="card-body flex-1 flex flex-col sm:flex-row items-center justify-between gap-6">
          {/* Proportional Donut Gauge */}
          <div className="relative flex items-center justify-center w-[140px] h-[140px] flex-shrink-0">
            <svg
              className="w-full h-full transform -rotate-90"
              viewBox={`0 0 ${size} ${size}`}
            >
              <circle
                cx={center}
                cy={center}
                r={radius}
                fill="transparent"
                stroke="var(--border-subtle, #eef2f7)"
                strokeWidth={strokeWidth}
              />

              {donutArcs.map((arc) => {
                const isHovered = hoveredSegment?.id === arc.id;
                return (
                  <circle
                    key={arc.id}
                    cx={center}
                    cy={center}
                    r={radius}
                    fill="transparent"
                    stroke={arc.color}
                    strokeWidth={isHovered ? strokeWidth + 2 : strokeWidth}
                    strokeDasharray={arc.strokeDasharray}
                    strokeDashoffset={arc.strokeDashoffset}
                    className="transition-all duration-150 cursor-pointer"
                    style={{
                      opacity: hoveredSegment && !isHovered ? 0.35 : 1,
                    }}
                    onMouseEnter={() => setHoveredSegment(arc)}
                    onMouseLeave={() => setHoveredSegment(null)}
                  />
                );
              })}
            </svg>

            {/* Clean Center Typography */}
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none px-2">
              {hoveredSegment ? (
                <>
                  <div className="metric-value" style={{ fontSize: "20px" }}>
                    {hoveredSegment.pct}%
                  </div>
                  <div className="text-[11px] font-medium text-slate-500 truncate max-w-[100px]">
                    {hoveredSegment.label}
                  </div>
                </>
              ) : (
                <>
                  <div className="metric-value blue" style={{ fontSize: "22px" }}>
                    {donut.recoveryRate}%
                  </div>
                  <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                    Recovered
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Clean Segment Table */}
          <div className="flex flex-col gap-2 w-full flex-1">
            {donut.segments.map((seg) => {
              const isHovered = hoveredSegment?.id === seg.id;
              return (
                <div
                  key={seg.id}
                  className={`flex items-center justify-between py-1.5 px-2 rounded-md transition-colors cursor-pointer border ${
                    isHovered
                      ? "bg-[var(--bg-hover)] border-[var(--border-strong)]"
                      : "bg-transparent border-transparent hover:bg-[var(--bg-raised)]"
                  }`}
                  onMouseEnter={() => setHoveredSegment(seg)}
                  onMouseLeave={() => setHoveredSegment(null)}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: seg.color }}
                    />
                    <span className="text-xs font-semibold text-slate-800">
                      {seg.label}
                    </span>
                  </div>

                  <div className="flex items-center gap-2.5 flex-shrink-0">
                    <span className="text-xs font-semibold text-slate-700">
                      {seg.pct}%
                    </span>
                    <span className="text-xs font-medium text-slate-500 font-mono min-w-[78px] text-right">
                      {formatRupeesLong(seg.amount)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* 2. Right Card: Channel Performance */}
      <div className="card lg:col-span-7 flex flex-col">
        <div className="card-header flex items-center justify-between">
          <span className="card-title">Channel Performance</span>

          {/* Clean Tab Buttons matching UI */}
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setActiveTab("actions")}
              className={`btn btn-sm ${
                activeTab === "actions" ? "btn-primary" : "btn-secondary"
              }`}
            >
              By Action
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("methods")}
              className={`btn btn-sm ${
                activeTab === "methods" ? "btn-primary" : "btn-secondary"
              }`}
            >
              By Payment Rail
            </button>
          </div>
        </div>

        {/* Structured Performance Rows */}
        <div className="card-body flex-1 flex flex-col justify-around gap-3.5">
          {activeBars.map((bar) => (
            <div
              key={bar.id}
              className="p-2.5 rounded-lg border border-slate-100 bg-slate-50/50 hover:bg-slate-50 transition-colors"
            >
              <div className="flex items-center justify-between text-xs mb-2">
                <div className="flex items-center gap-2">
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: bar.color }}
                  />
                  <span className="font-semibold text-slate-900">{bar.label}</span>
                </div>

                <div className="flex items-center gap-3">
                  <span className="font-mono text-xs font-medium text-slate-600">
                    {formatRupeesLong(bar.amount)}
                  </span>
                  <span className={`badge ${bar.badgeClass} text-[11px]`}>
                    {bar.badgeText ? bar.badgeText : `${bar.successRate}% Success`}
                  </span>
                </div>
              </div>

              {/* Progress Bar Track with soft background */}
              <div className="w-full h-1.5 bg-slate-200/80 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{
                    width: `${Math.max(bar.successRate, 5)}%`,
                    backgroundColor: bar.color,
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
