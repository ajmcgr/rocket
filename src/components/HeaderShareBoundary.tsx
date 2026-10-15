import { Component, type ReactNode } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { reportLovableError } from "@/lib/lovable-error-reporting";

type Props = {
  children: ReactNode;
  onClose: () => void;
  url: string;
};

type State = { failed: boolean; notice: string };

export default class HeaderShareBoundary extends Component<Props, State> {
  override state: State = { failed: false, notice: "" };

  static getDerivedStateFromError(): Pick<State, "failed"> {
    return { failed: true };
  }

  override componentDidCatch(error: unknown) {
    reportLovableError(error, { boundary: "header_share" });
  }

  private copyLink = async () => {
    try {
      await navigator.clipboard.writeText(this.props.url);
      this.setState({ notice: "Link copied." });
    } catch {
      this.setState({ notice: "Select the link below to copy it." });
    }
  };

  override render() {
    if (!this.state.failed) return this.props.children;

    return (
      <Dialog open onOpenChange={(open) => { if (!open) this.props.onClose(); }}>
        <DialogContent motion="gentle" className="max-w-md">
          <DialogHeader>
            <DialogTitle>Share Rocket</DialogTitle>
            <DialogDescription>Share options could not load. You can still copy the Rocket link.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => void this.copyLink()} className="min-h-11 rounded-lg border border-neutral-200 px-4 text-sm">Copy link</button>
            <a href={this.props.url} className="inline-flex min-h-11 items-center rounded-lg border border-neutral-200 px-4 text-sm">Open Rocket</a>
          </div>
          <input readOnly aria-label="Rocket share link" value={this.props.url} onFocus={(event) => event.currentTarget.select()} className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm" />
          {this.state.notice && <p role="status" className="text-sm text-neutral-600">{this.state.notice}</p>}
        </DialogContent>
      </Dialog>
    );
  }
}
