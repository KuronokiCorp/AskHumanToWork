import { useMutation, useQuery } from '@tanstack/react-query';
import { CreditCard, ExternalLink } from 'lucide-react';
import { api } from '../api';
import { Button, Chip, PageHeader, SectionCard } from '../components/ui';

function usd(micros: number): string {
  return `$${(micros / 1_000_000).toFixed(2)}`;
}

const STATUS_LABEL = {
  none: { text: 'No card on file', tone: 'zinc' },
  active: { text: 'Card on file', tone: 'emerald' },
  past_due: { text: 'Payment failed', tone: 'red' },
} as const;

export default function SettingsBilling() {
  const query = useQuery({ queryKey: ['usage'], queryFn: () => api.usage() });

  // Both flows hand off to a Stripe-hosted page.
  const checkout = useMutation({
    mutationFn: () => api.billingCheckout(),
    onSuccess: ({ url }) => window.location.assign(url),
  });
  const portal = useMutation({
    mutationFn: () => api.billingPortal(),
    onSuccess: ({ url }) => window.location.assign(url),
  });

  if (query.isLoading) {
    return (
      <div className="mx-auto max-w-[680px] px-8 py-10">
        <div className="h-48 animate-pulse rounded-xl bg-zinc-200/50" />
      </div>
    );
  }
  if (query.isError || !query.data) {
    return <div className="p-10 text-sm text-red-600">Could not load usage.</div>;
  }

  const { usage, billingEnabled } = query.data;
  const status = STATUS_LABEL[usage.billingStatus];
  const usedPct = Math.min(100, (usage.usedMicros / usage.freeAllowanceMicros) * 100);
  const periodLabel = new Date(usage.periodStart).toLocaleDateString([], {
    month: 'long',
    year: 'numeric',
  });

  return (
    <div className="mx-auto max-w-[680px] px-8 py-10 animate-fade-in">
      <PageHeader
        title="Billing"
        subtitle="The AI assistant is free up to a monthly allowance. Beyond that, usage is billed by what you actually use."
        badge={<Chip tone={status.tone}>{status.text}</Chip>}
      />

      <SectionCard title={`Usage — ${periodLabel}`}>
        <div className="mb-2 h-2 w-full overflow-hidden rounded-full bg-white/[0.06]">
          <div
            className={`h-full rounded-full transition-all ${
              usedPct >= 100 ? 'bg-amber-500' : 'bg-accent-500'
            }`}
            style={{ width: `${usedPct}%` }}
          />
        </div>
        <div className="flex items-baseline justify-between text-[13px]">
          <span className="text-zinc-500">
            {usd(usage.usedMicros)} of {usd(usage.freeAllowanceMicros)} free allowance
          </span>
          <span className="font-medium text-zinc-300">
            {usage.messageCount} {usage.messageCount === 1 ? 'reply' : 'replies'}
          </span>
        </div>

        {usage.billedMicros > 0 && (
          <p className="mt-3 border-t border-zinc-100 pt-3 text-[13px] text-zinc-400">
            <span className="font-semibold">{usd(usage.billedMicros)}</span> beyond the free
            allowance this month — billed at the end of the period.
          </p>
        )}

        {usage.exhausted && (
          <p className="mt-3 rounded-xl bg-amber-50/70 p-3 text-[13px] text-amber-800">
            You've used this month's free allowance, so the assistant is paused. Add a card to keep
            going — the allowance resets on the 1st.
          </p>
        )}
      </SectionCard>

      {!billingEnabled ? (
        <SectionCard title="Payments unavailable">
          <p className="text-[13px] leading-relaxed text-zinc-500">
            This deployment has no payment provider configured, so usage is capped at the free
            allowance.
          </p>
        </SectionCard>
      ) : usage.billingStatus === 'none' ? (
        <SectionCard
          title="Add a card"
          description="Only usage beyond the free allowance is charged. No subscription fee, and you can remove the card at any time."
        >
          <Button onClick={() => checkout.mutate()} disabled={checkout.isPending}>
            <CreditCard size={15} /> {checkout.isPending ? 'Redirecting…' : 'Add payment method'}
          </Button>
          {checkout.isError && (
            <p className="mt-2 text-xs text-red-600">{(checkout.error as Error).message}</p>
          )}
        </SectionCard>
      ) : (
        <SectionCard
          title="Payment method"
          description="Update your card, review invoices, or cancel."
          tone={usage.billingStatus === 'past_due' ? 'warn' : 'default'}
        >
          <Button variant="secondary" onClick={() => portal.mutate()} disabled={portal.isPending}>
            <ExternalLink size={15} /> {portal.isPending ? 'Redirecting…' : 'Manage billing'}
          </Button>
          {portal.isError && (
            <p className="mt-2 text-xs text-red-600">{(portal.error as Error).message}</p>
          )}
        </SectionCard>
      )}
    </div>
  );
}
