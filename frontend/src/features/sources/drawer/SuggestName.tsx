"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { suggestPlatformName, type Platform } from "@/api/platforms";
import { queryKeys } from "@/api/queryKeys";
import { useI18n } from "@/i18n/useI18n";
import { Button } from "@/ui/Button";
import { useToast } from "@/ui/ToastProvider";

interface SuggestNameProps {
  platformId: number;
  /** The name the server generated and already stored. */
  onStored: (name: string) => void;
}

/**
 * "Namen vorschlagen" (G17). POST /generate-name stores the name itself, so the suggestion is
 * saved, not a draft: the list takes it and the field shows it without an unsaved change.
 */
export function SuggestName({ platformId, onStored }: SuggestNameProps) {
  const { t } = useI18n();
  const suggest = useSuggestName({ platformId, onStored });
  return (
    <Button variant="ghost" size="sm" busy={suggest.isPending} onClick={() => suggest.mutate()}>
      {t("sources.field.suggest")}
    </Button>
  );
}

/** Same scope as the section saves: a name PATCH and a suggestion never cross. */
function useSuggestName({ platformId, onStored }: SuggestNameProps) {
  const { t } = useI18n();
  const toast = useToast();
  const queryClient = useQueryClient();
  return useMutation({
    scope: { id: `source-${platformId}` },
    mutationFn: () => suggestPlatformName(platformId),
    onSuccess: (name) => {
      queryClient.setQueryData<Platform[]>(queryKeys.platforms, (list) =>
        list?.map((platform) => (platform.id === platformId ? { ...platform, name } : platform)),
      );
      onStored(name);
    },
    onError: () => toast.show({ message: t("sources.field.suggestFailed"), tone: "error" }),
  });
}
