'use client';

import { useState } from 'react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';

import { ImageLightbox } from '@/components/common/ImageLightbox';
import { Upload } from '@/components/ui/Upload';
import { apiClient } from '@/libs/axios';
import type { ApiResponse } from '@/types';

const MAX_ATTACHMENTS = 3;

interface PendingItem {
  id: string;
  objectUrl: string;
  error: boolean;
}

interface TaskAttachmentsFieldProps {
  value: string[];
  onChange: (urls: string[]) => void;
}

export function TaskAttachmentsField({ value, onChange }: TaskAttachmentsFieldProps) {
  const t = useTranslations('tasks');
  const [pending, setPending] = useState<PendingItem[]>([]);
  const [lightbox, setLightbox] = useState<string | null>(null);

  const totalCount = value.length + pending.length;
  const canAddMore = totalCount < MAX_ATTACHMENTS;

  async function handleFiles(files: File[]) {
    // Snapshot current counts so all concurrent uploads in this batch see consistent state
    const slots = MAX_ATTACHMENTS - value.length - pending.length;
    const toUpload = files.slice(0, Math.max(slots, 0));
    if (toUpload.length === 0) return;

    const newPending: PendingItem[] = toUpload.map((f) => ({
      id: `${Date.now()}-${Math.random()}`,
      objectUrl: URL.createObjectURL(f),
      error: false,
    }));

    setPending((prev) => [...prev, ...newPending]);

    // Collect successful URLs from this batch, then update parent once
    const newUrls: string[] = [];

    await Promise.all(
      toUpload.map(async (file, i) => {
        const item = newPending[i] as PendingItem;
        try {
          const formData = new FormData();
          formData.append('file', file);
          const { data } = await apiClient.post<ApiResponse<{ url: string }>>(
            '/upload/attachment',
            formData,
            { headers: { 'Content-Type': 'multipart/form-data' } },
          );
          URL.revokeObjectURL(item.objectUrl);
          setPending((prev) => prev.filter((p) => p.id !== item.id));
          newUrls.push(data.data.url);
        } catch {
          setPending((prev) => prev.map((p) => (p.id === item.id ? { ...p, error: true } : p)));
        }
      }),
    );

    if (newUrls.length > 0) {
      onChange([...value, ...newUrls]);
    }
  }

  function removeUploaded(url: string) {
    onChange(value.filter((u) => u !== url));
  }

  function removePending(id: string) {
    setPending((prev) => {
      const item = prev.find((p) => p.id === id);
      if (item) URL.revokeObjectURL(item.objectUrl);
      return prev.filter((p) => p.id !== id);
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {canAddMore && (
        <Upload
          accept="image/jpeg,image/png,image/webp,image/gif"
          multiple
          maxSizeMb={5}
          files={[]}
          onFilesChange={handleFiles}
          hint={t('taskForm.attachmentsField.remaining', { count: MAX_ATTACHMENTS - totalCount })}
        />
      )}

      {(value.length > 0 || pending.length > 0) && (
        <div className="grid grid-cols-3 gap-2">
          {value.map((url) => (
            <div
              key={url}
              className="relative aspect-square w-full rounded-[var(--r-md)] overflow-hidden border border-[var(--border)]"
            >
              <button
                type="button"
                onClick={() => setLightbox(url)}
                className="absolute inset-0 cursor-zoom-in"
                aria-label={t('taskForm.attachmentsField.preview')}
              >
                <Image src={url} alt="Attachment" fill sizes="150px" className="object-cover" />
              </button>
              <button
                type="button"
                onClick={() => removeUploaded(url)}
                className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-black/60 text-white text-[12px] leading-none flex items-center justify-center hover:bg-[var(--rose)] cursor-pointer"
                aria-label={t('taskForm.attachmentsField.remove')}
              >
                ×
              </button>
            </div>
          ))}

          {pending.map((item) => (
            <div
              key={item.id}
              className="relative aspect-square w-full rounded-[var(--r-md)] overflow-hidden border border-[var(--border)]"
            >
              <Image
                src={item.objectUrl}
                alt="Uploading"
                fill
                sizes="150px"
                className="object-cover opacity-60"
              />
              <div className="absolute inset-0 flex items-center justify-center">
                {item.error ? (
                  <span className="text-[var(--rose)] text-[11px] [font-family:var(--f-mono)] px-2 text-center">
                    {t('taskForm.attachmentsField.uploadFailed')}
                  </span>
                ) : (
                  <div className="w-6 h-6 border-2 border-[var(--gold)] border-t-transparent rounded-full animate-spin" />
                )}
              </div>
              {item.error && (
                <button
                  type="button"
                  onClick={() => removePending(item.id)}
                  className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-black/60 text-white text-[12px] leading-none flex items-center justify-center hover:bg-[var(--rose)] cursor-pointer"
                  aria-label={t('taskForm.attachmentsField.remove')}
                >
                  ×
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Lightbox — full-screen image preview */}
      {lightbox && (
        <ImageLightbox
          src={lightbox}
          closeLabel={t('taskForm.attachmentsField.close')}
          onClose={() => setLightbox(null)}
        />
      )}
    </div>
  );
}
