import { Calendar, Cog, FileText, Mail, Phone } from 'lucide-react';
import { apiListActivities, type Activity, type ActivityType } from '@/lib/api';
import { AddNoteForm } from './add-note-form';
import { DeleteActivityButton } from './delete-activity-button';

const ICON_BY_TYPE: Record<ActivityType, typeof FileText> = {
  note: FileText,
  call: Phone,
  email: Mail,
  meeting: Calendar,
  system: Cog,
};

const LABEL_BY_TYPE: Record<ActivityType, string> = {
  note: 'Nota',
  call: 'Chamada',
  email: 'E-mail',
  meeting: 'Reunião',
  system: 'Sistema',
};

function dateLabel(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export async function Timeline({ contactId }: { contactId: string }) {
  const { data, meta } = await apiListActivities(contactId);

  return (
    <section className="border-t">
      <header className="flex items-center justify-between px-4 py-3">
        <h2 className="text-sm font-medium">
          Atividades{' '}
          <span className="text-muted-foreground">({meta.total})</span>
        </h2>
      </header>

      <div className="border-t px-4 py-3">
        <AddNoteForm contactId={contactId} />
      </div>

      {data.length === 0 ? (
        <div className="border-t px-4 py-8 text-center text-xs text-muted-foreground">
          Sem atividades ainda. Adicione a primeira nota acima.
        </div>
      ) : (
        <ol className="divide-y border-t">
          {data.map((activity) => (
            <TimelineItem key={activity.id} activity={activity} />
          ))}
        </ol>
      )}
    </section>
  );
}

function TimelineItem({ activity }: { activity: Activity }) {
  const Icon = ICON_BY_TYPE[activity.type];
  const isSystem = activity.type === 'system';
  return (
    <li className="group flex gap-3 px-4 py-3">
      <span
        className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground"
        aria-hidden
      >
        <Icon className="size-3.5" />
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <p className="truncate text-sm font-medium">
            {activity.title ?? LABEL_BY_TYPE[activity.type]}
          </p>
          <span className="shrink-0 text-xs text-muted-foreground">
            {dateLabel(activity.createdAt)}
          </span>
        </div>
        {activity.body && (
          <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">
            {activity.body}
          </p>
        )}
        {isSystem && (
          <p className="mt-1 text-xs text-muted-foreground">
            Registro automático
          </p>
        )}
      </div>
      {!isSystem && (
        <div className="opacity-0 transition-opacity group-hover:opacity-100">
          <DeleteActivityButton activityId={activity.id} />
        </div>
      )}
    </li>
  );
}
