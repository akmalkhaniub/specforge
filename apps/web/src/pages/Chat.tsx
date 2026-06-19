/**
 * Chat page: streamed requirements-gathering conversation. Streams assistant
 * tokens in real time and shows a banner when requirements are captured.
 */
import type { ChatMessage } from '@specforge/shared';
import { CheckCircle2, SendHorizontal } from 'lucide-react';
import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { API_BASE } from '../lib/api';
import { useOrg } from '../lib/org';
import { readSSE } from '../lib/sse';
import { Card } from '../components/ui';

export function Chat(): JSX.Element {
  const { orgId } = useOrg();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [completed, setCompleted] = useState<{ projectId: string } | null>(null);
  const threadRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = (): void => {
    requestAnimationFrame(() => {
      threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight });
    });
  };

  const send = async (): Promise<void> => {
    const content = input.trim();
    if (!content || streaming) return;
    const nextMessages: ChatMessage[] = [...messages, { role: 'user', content }];
    setMessages([...nextMessages, { role: 'assistant', content: '' }]);
    setInput('');
    setStreaming(true);
    scrollToBottom();

    try {
      const res = await fetch(`${API_BASE}/api/chat/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: nextMessages, orgId }),
      });
      if (!res.body) throw new Error('No response stream');

      await readSSE(res.body, (event, data) => {
        const parsed = JSON.parse(data) as Record<string, unknown>;
        if (event === 'chunk' && typeof parsed.text === 'string') {
          const text = parsed.text;
          setMessages((prev) => {
            const copy = [...prev];
            const last = copy[copy.length - 1];
            if (last && last.role === 'assistant') copy[copy.length - 1] = { ...last, content: last.content + text };
            return copy;
          });
          scrollToBottom();
        } else if (event === 'requirements_complete' && typeof parsed.projectId === 'string') {
          setCompleted({ projectId: parsed.projectId });
        }
      });
    } catch {
      setMessages((prev) => [...prev, { role: 'assistant', content: '⚠️ Chat failed. Is the API key configured?' }]);
    } finally {
      setStreaming(false);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-7rem)] max-w-2xl">
      {completed ? (
        <div className="mb-3 flex items-center justify-between bg-success/15 border border-success/40 rounded p-3">
          <span className="flex items-center gap-2 text-success text-sm">
            <CheckCircle2 size={16} /> Requirements captured
          </span>
          <Link to={`/projects/${completed.projectId}`} className="text-sm text-accent hover:underline">
            View Project →
          </Link>
        </div>
      ) : null}

      <div ref={threadRef} className="flex-1 overflow-auto space-y-3 pr-1">
        {messages.length === 0 ? (
          <Card>
            <div className="text-muted text-sm">
              Describe your project and I'll help define its requirements. I'll ask about
              stakeholders, goals, and key features, then capture a structured PRD.
            </div>
          </Card>
        ) : null}
        {messages.map((m, i) => (
          <div key={i} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
            <div
              className={`max-w-[80%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap ${
                m.role === 'user' ? 'bg-accent text-white' : 'bg-surface border border-border'
              }`}
            >
              {m.content || (streaming ? '…' : '')}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-3 flex items-end gap-2">
        <textarea
          className="flex-1 bg-surface border border-border rounded px-3 py-2 text-sm resize-none"
          rows={2}
          placeholder="Type a message… (Enter to send, Shift+Enter for newline)"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
        />
        <button
          className="p-2.5 rounded bg-accent text-white disabled:opacity-50"
          disabled={streaming || !input.trim()}
          onClick={() => void send()}
        >
          <SendHorizontal size={18} />
        </button>
      </div>
    </div>
  );
}
