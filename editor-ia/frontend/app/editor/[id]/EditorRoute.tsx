"use client";

import { useParams } from "next/navigation";
import { Editor } from "@/components/editor/Editor";

export function EditorRoute() {
  const { id } = useParams<{ id: string }>();
  // `key` recria o editor do zero ao trocar de imagem
  return <Editor key={id} imageId={id} />;
}
