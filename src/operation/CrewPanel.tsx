import { LayoutGroup } from 'framer-motion';
import { Users } from 'lucide-react';
import { AgentCard } from '../components/crew/AgentCard';
import { Panel } from '../components/ui/primitives';
import { CREW_ORDER, FIELD_AGENTS } from '../data/crew';
import type { AgentId, AgentRuntime } from '../types';

export function CrewPanel({ agents }: { agents: Record<AgentId, AgentRuntime> }) {
  const deployed = FIELD_AGENTS.filter((id) => agents[id].activatedAt !== undefined).length;
  return (
    <Panel
      title="Crew deployed"
      icon={<Users size={13} aria-hidden />}
      right={
        <span className="font-mono text-xs text-gold-300" aria-label={`${deployed} of ${FIELD_AGENTS.length} crew members deployed`}>
          {deployed}/{FIELD_AGENTS.length}
        </span>
      }
      className="flex-1"
      bodyClassName="overflow-y-auto scrollbar-thin"
    >
      <div className="px-3 pt-3">
        <div className="flex gap-1" aria-hidden>
          {FIELD_AGENTS.map((id) => (
            <span
              key={id}
              className={`h-1 flex-1 rounded-full transition-colors duration-700 ${agents[id].activatedAt !== undefined ? 'bg-gold-400' : 'bg-vault-700'}`}
            />
          ))}
        </div>
      </div>
      <LayoutGroup>
        <ul className="flex flex-col gap-2 p-3">
          {CREW_ORDER.map((id) => (
            <AgentCard key={id} id={id} runtime={agents[id]} />
          ))}
        </ul>
      </LayoutGroup>
    </Panel>
  );
}
