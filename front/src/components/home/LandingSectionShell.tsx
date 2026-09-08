import type { ReactNode } from 'react';
import { Inbox } from 'lucide-react';
import FormAlert from '../common/FormAlert';

interface LandingSectionShellProps {
  isLoading: boolean;
  error: string | null;
  isEmpty: boolean;
  // Rendered while loading, sized like the real content so nothing shifts.
  skeleton: ReactNode;
  emptyTitle: string;
  emptyMessage: string;
  children: ReactNode;
}

/**
 * The loading / error / empty contract every data-backed landing section
 * shares. Error and empty are deliberately different states: an empty list is
 * a gym that has not published anything yet, a failed request is an outage,
 * and showing the first message for the second hides the problem.
 */
const LandingSectionShell = ({
  isLoading,
  error,
  isEmpty,
  skeleton,
  emptyTitle,
  emptyMessage,
  children,
}: LandingSectionShellProps) => {
  if (isLoading) return <>{skeleton}</>;

  if (error) {
    return (
      <div className="mx-auto max-w-2xl">
        <FormAlert type="error" message={error} />
      </div>
    );
  }

  if (isEmpty) {
    return (
      <div className="mx-auto max-w-md rounded-2xl border border-border bg-surface/50 p-8 text-center">
        <Inbox className="mx-auto h-10 w-10 text-text-muted/60" />
        <h3 className="mt-4 font-display text-lg font-semibold text-text">
          {emptyTitle}
        </h3>
        <p className="mt-2 font-body text-sm text-text-muted">{emptyMessage}</p>
      </div>
    );
  }

  return <>{children}</>;
};

export default LandingSectionShell;
