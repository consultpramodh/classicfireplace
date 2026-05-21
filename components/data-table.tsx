import Link from "next/link";
import type { ServiceRequest } from "@/lib/types";
import { StatusBadge } from "@/components/status-badge";

export function DataTable({ requests }: { requests: ServiceRequest[] }) {
  return (
    <div className="ops-table-wrap">
      <table className="prototype-table">
        <thead>
          <tr>
            <th>Request</th>
            <th>Customer</th>
            <th>Service</th>
            <th>State</th>
            <th>Striven IDs</th>
            <th>Next</th>
          </tr>
        </thead>
        <tbody>
          {requests.map((request) => (
            <tr key={request.id}>
              <td><Link className="inline-link" href={`/requests/${request.id}`} prefetch>{request.id}</Link></td>
              <td><strong>{request.customerName}</strong><small>{request.city}, {request.province}</small></td>
              <td>{request.serviceDetails}</td>
              <td><StatusBadge status={request.state} /></td>
              <td><small>C {request.striven.customerId ?? "-"} · O {request.striven.opportunityId ?? "-"} · SO {request.striven.serviceOrderNumber ?? "-"}</small></td>
              <td>{request.ai.suggestedNextStep}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
