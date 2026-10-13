"use client";

import { useQuery } from "@tanstack/react-query";
import { profileQueryOptions } from "@/api/profile";
import { documentTemplatesQueryOptions, fileTemplatesQueryOptions } from "@/api/templates";
import { TEMPLATE_KINDS } from "@/domain/templates";
import { ProfileSectionFrame } from "../ProfileSectionFrame";
import { SectionState } from "../SectionState";
import { TemplateGallery, type TemplateGalleryProps } from "./TemplateGallery";

export function TemplatesSection() {
  return (
    <ProfileSectionFrame section="vorlagen">
      <TemplatesBody />
    </ProfileSectionFrame>
  );
}

/** The three requests start together (page prefetch); the nesting only orders what is shown. */
function TemplatesBody() {
  const templates = useQuery(documentTemplatesQueryOptions());
  const files = useQuery(fileTemplatesQueryOptions());
  return (
    <SectionState query={templates}>
      {(templateList) => (
        <SectionState query={files}>
          {(fileList) => <Galleries templates={templateList} files={fileList} />}
        </SectionState>
      )}
    </SectionState>
  );
}

function Galleries({ templates, files }: Pick<TemplateGalleryProps, "templates" | "files">) {
  const profile = useQuery(profileQueryOptions());
  return (
    <SectionState query={profile}>
      {(stored) =>
        TEMPLATE_KINDS.map((kind) => (
          <TemplateGallery
            key={kind}
            kind={kind}
            profile={stored}
            templates={templates}
            files={files}
          />
        ))
      }
    </SectionState>
  );
}
