import { useEffect, useRef, useState } from "react";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogFooter,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from "@/components/ui/responsive-dialog";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { useTranslation } from "react-i18next";
import { DiscardChangesDialog } from "@/components/ui/discard-changes-dialog";

interface Props {
  file: File | null;
  open: boolean;
  onClose: () => void;
  onConfirm: (blob: Blob) => void;
  size?: number; // output square size
}

export default function ImageCropDialog({ file, open, onClose, onConfirm, size = 512 }: Props) {
  const { t } = useTranslation();
  const [src, setSrc] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null);
  const [showDiscardCrop, setShowDiscardCrop] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!file) { setSrc(null); return; }
    const url = URL.createObjectURL(file);
    setSrc(url);
    setZoom(1);
    setOffset({ x: 0, y: 0 });
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const onPointerDown = (e: React.PointerEvent) => {
    setDrag({ x: e.clientX - offset.x, y: e.clientY - offset.y });
    (e.target as Element).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag) return;
    setOffset({ x: e.clientX - drag.x, y: e.clientY - drag.y });
  };
  const onPointerUp = () => setDrag(null);

  const confirm = async () => {
    const img = imgRef.current;
    const box = boxRef.current;
    if (!img || !box) return;
    const boxRect = box.getBoundingClientRect();
    const imgRect = img.getBoundingClientRect();
    // Map the visible square (boxRect) back to source pixels.
    const scaleX = img.naturalWidth / imgRect.width;
    const scaleY = img.naturalHeight / imgRect.height;
    const sx = Math.max(0, (boxRect.left - imgRect.left) * scaleX);
    const sy = Math.max(0, (boxRect.top - imgRect.top) * scaleY);
    const sw = Math.min(img.naturalWidth - sx, boxRect.width * scaleX);
    const sh = Math.min(img.naturalHeight - sy, boxRect.height * scaleY);
    const canvas = document.createElement("canvas");
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, size, size);
    canvas.toBlob((b) => { if (b) onConfirm(b); }, "image/jpeg", 0.9);
  };

  const cropIsDirty = zoom !== 1 || offset.x !== 0 || offset.y !== 0;
  const handleCropOpenChange = (o: boolean) => {
    if (!o && cropIsDirty) { setShowDiscardCrop(true); return; }
    if (!o) onClose();
  };

  return (
    <>
    {/* Bottom-sheet drag-to-close is disabled on mobile because the inner
        crop box uses pointer-drag gestures for panning the photo. Users close
        via the Cancel button instead. */}
    <ResponsiveDialog open={open} onOpenChange={handleCropOpenChange} dismissible={false}>
      <ResponsiveDialogContent className="max-w-sm">
        <ResponsiveDialogHeader><ResponsiveDialogTitle>{t("common.adjustPhoto")}</ResponsiveDialogTitle></ResponsiveDialogHeader>
        {src && (
          <>
            <div
              ref={boxRef}
              className="relative w-64 h-64 mx-auto overflow-hidden rounded-full bg-muted touch-none cursor-grab active:cursor-grabbing"
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
            >
              <img
                ref={imgRef}
                src={src}
                alt=""
                draggable={false}
                className="absolute left-1/2 top-1/2 max-w-none select-none pointer-events-none"
                style={{
                  transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px)) scale(${zoom})`,
                  width: "100%",
                  transformOrigin: "center",
                }}
              />
            </div>
            <div className="px-2">
              <Slider value={[zoom]} min={1} max={4} step={0.05} onValueChange={(v) => setZoom(v[0])} />
            </div>
          </>
        )}
        <ResponsiveDialogFooter>
          <Button type="button" variant="ghost" onClick={() => { if (cropIsDirty) { setShowDiscardCrop(true); } else { onClose(); } }}>{t("common.cancel")}</Button>
          <Button type="button" onClick={confirm}>{t("common.save")}</Button>
        </ResponsiveDialogFooter>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
    <DiscardChangesDialog
      open={showDiscardCrop}
      onOpenChange={setShowDiscardCrop}
      onDiscard={onClose}
    />
    </>
  );
}
