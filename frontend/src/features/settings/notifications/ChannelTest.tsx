"use client";

import { useMutation } from "@tanstack/react-query";
import { testChannel, type Channel } from "@/api/notificationChannels";
import { useI18n } from "@/i18n/useI18n";
import { Button } from "@/ui/Button";
import { useToast } from "@/ui/ToastProvider";
import { channelErrorText, TEST_REASON_TEXT } from "./channelText";

const FALLBACK_REASON = "failed";

/** Ruling 41: the outcome is a fixed sentence; the toast never repeats an address. */
function useChannelTest(channel: Channel) {
  const { t } = useI18n();
  const toast = useToast();
  const params = { channel: channel.name };
  return useMutation({
    mutationFn: () => testChannel(channel.id),
    onSuccess: ({ delivered, reason }) =>
      delivered
        ? toast.show({ tone: "success", message: t("sources.notify.testSent", params) })
        : toast.show({
            tone: "error",
            message: t(TEST_REASON_TEXT[reason ?? FALLBACK_REASON], params),
          }),
    onError: (error) => toast.show({ tone: "error", message: channelErrorText(error, t) }),
  });
}

export interface ChannelTestProps {
  channel: Channel;
  /** The open form holds edits: a test would send the stored state, not what is shown (D6). */
  dirty?: boolean;
}

/** "Test über {name} senden": a fixed test message to the channel's own recipients. */
export function ChannelTest({ channel, dirty = false }: ChannelTestProps) {
  const { t } = useI18n();
  const test = useChannelTest(channel);
  const reasonId = `chan-test-why-${channel.id}`;
  return (
    <>
      {dirty ? <SaveFirst id={reasonId} /> : null}
      <Button
        size="sm"
        busy={test.isPending}
        inactive={dirty}
        aria-describedby={dirty ? reasonId : undefined}
        onClick={() => test.mutate()}
      >
        {t("sources.notify.testLabel", { channel: channel.name })}
      </Button>
    </>
  );
}

/** Visible, not only for screen readers: the greyed-out button says why it waits. */
function SaveFirst({ id }: { id: string }) {
  const { t } = useI18n();
  return (
    <span className="hint" id={id}>
      {t("sources.notify.saveFirst")}
    </span>
  );
}
