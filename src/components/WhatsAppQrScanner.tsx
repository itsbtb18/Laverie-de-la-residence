import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

export type ParsedWhatsAppQr =
  | { kind: "booking-validation"; bookingId: string; rawText: string }
  | { kind: "login"; phone: string; secretCode: string; rawText: string }
  | { kind: "unknown"; rawText: string };

type WhatsAppQrScannerProps = {
  onScan: (payload: ParsedWhatsAppQr) => void;
  onStatusChange?: (status: string) => void;
  instruction?: string;
};

type ScanMode = "camera" | "file";

export function parseWhatsAppQr(rawText: string): ParsedWhatsAppQr {
  if (rawText.startsWith("VALIDATE_BOOKING:")) {
    return {
      kind: "booking-validation",
      bookingId: rawText.replace("VALIDATE_BOOKING:", "").trim(),
      rawText,
    };
  }

  if (rawText.startsWith("LOGIN:")) {
    const parts = rawText.split(":");
    return {
      kind: "login",
      phone: parts[1] || "",
      secretCode: parts[2] || "",
      rawText,
    };
  }

  return { kind: "unknown", rawText };
}

export function WhatsAppQrScanner({
  onScan,
  onStatusChange,
  instruction,
}: WhatsAppQrScannerProps) {
  const { t } = useTranslation();
  const regionId = useId().replace(/:/g, "-");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const html5QrRef = useRef<{
    stop: () => Promise<void>;
    isScanning: boolean;
    scanFile: (file: File, showImage?: boolean) => Promise<string>;
  } | null>(null);

  const [mode, setMode] = useState<ScanMode>("camera");
  const [scanError, setScanError] = useState<string | null>(null);
  const [cameraUnavailable, setCameraUnavailable] = useState(false);
  const [isStartingCamera, setIsStartingCamera] = useState(false);

  const handleDecoded = useCallback(
    (decodedText: string) => {
      setScanError(null);
      onScan(parseWhatsAppQr(decodedText));
      onStatusChange?.("qr-detected");
    },
    [onScan, onStatusChange]
  );

  const stopCamera = useCallback(async () => {
    const scanner = html5QrRef.current;
    if (!scanner?.isScanning) {
      return;
    }
    try {
      await scanner.stop();
    } catch {
      /* ignore stop errors */
    }
  }, []);

  useEffect(() => {
    if (mode !== "camera") {
      void stopCamera();
      return;
    }

    let cancelled = false;

    async function startCamera() {
      setScanError(null);
      setCameraUnavailable(false);
      setIsStartingCamera(true);
      onStatusChange?.("camera-starting");

      try {
        const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import("html5-qrcode");
        if (cancelled) {
          return;
        }

        await stopCamera();
        const scanner = new Html5Qrcode(regionId, {
          formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
          verbose: false,
        });
        html5QrRef.current = scanner;

        const cameras = await Html5Qrcode.getCameras();
        if (cancelled) {
          return;
        }

        if (!cameras.length) {
          setCameraUnavailable(true);
          onStatusChange?.("camera-unavailable");
          return;
        }

        const preferred =
          cameras.find((camera) => /back|rear|arrière|environment/i.test(camera.label))
            ?.id ??
          cameras[cameras.length - 1]?.id ??
          cameras[0].id;

        await scanner.start(
          preferred,
          {
            fps: 12,
            qrbox: (viewfinderWidth, viewfinderHeight) => {
              const edge = Math.floor(Math.min(viewfinderWidth, viewfinderHeight) * 0.78);
              return { width: edge, height: edge };
            },
            aspectRatio: 1,
            disableFlip: false,
          },
          handleDecoded,
          () => undefined
        );

        if (!cancelled) {
          onStatusChange?.("scanning");
        }
      } catch {
        if (!cancelled) {
          setCameraUnavailable(true);
          onStatusChange?.("camera-unavailable");
        }
      } finally {
        if (!cancelled) {
          setIsStartingCamera(false);
        }
      }
    }

    void startCamera();

    return () => {
      cancelled = true;
      void stopCamera();
    };
  }, [mode, regionId, handleDecoded, onStatusChange, stopCamera]);

  const scanImageFile = async (file: File) => {
    setScanError(null);
    onStatusChange?.("scanning");

    try {
      const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import("html5-qrcode");

      if (html5QrRef.current?.isScanning) {
        await stopCamera();
      }

      let scanner = html5QrRef.current;
      if (!scanner) {
        scanner = new Html5Qrcode(regionId, {
          formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
          verbose: false,
        });
        html5QrRef.current = scanner;
      }

      const decoded = await scanner.scanFile(file, true);
      handleDecoded(decoded);
    } catch {
      setScanError(t("errors.qrScanNotDetected"));
      onStatusChange?.("scan-failed");
    }
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) {
      void scanImageFile(file);
    }
  };

  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-sky-100 bg-sky-50/70 p-4 text-sm leading-6 text-slate-600">
        {instruction || t("qrScanDefaultInstruction")}
      </div>

      <ul className="list-disc space-y-1 rounded-2xl border border-amber-100 bg-amber-50/80 px-4 py-3 text-xs leading-5 text-amber-900">
        <li>{t("qrScanTipCamera")}</li>
        <li>{t("qrScanTipNoScreenPhoto")}</li>
        <li>{t("qrScanTipLighting")}</li>
      </ul>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => {
            setScanError(null);
            setMode("camera");
          }}
          className={`flex-1 rounded-xl px-3 py-2.5 text-xs font-bold transition cursor-pointer ${
            mode === "camera"
              ? "bg-slate-900 text-white"
              : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
          }`}
        >
          {t("qrScanModeCamera")}
        </button>
        <button
          type="button"
          onClick={() => {
            setScanError(null);
            void stopCamera();
            setMode("file");
          }}
          className={`flex-1 rounded-xl px-3 py-2.5 text-xs font-bold transition cursor-pointer ${
            mode === "file"
              ? "bg-slate-900 text-white"
              : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
          }`}
        >
          {t("qrScanModeFile")}
        </button>
      </div>

      {scanError ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs leading-5 text-rose-800">
          {scanError}
        </div>
      ) : null}

      {cameraUnavailable && mode === "camera" ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-700">
          {t("errors.qrCameraUnavailable")}
        </div>
      ) : null}

      <div
        className={`overflow-hidden rounded-[1.5rem] border border-sky-100 bg-black/5 shadow-inner ${
          mode === "file" ? "hidden" : ""
        }`}
      >
        {isStartingCamera ? (
          <p className="px-4 py-8 text-center text-xs font-medium text-slate-500">
            {t("qrScanStartingCamera")}
          </p>
        ) : null}
        <div id={regionId} className="w-full [&_video]:rounded-[1.5rem]" />
      </div>

      {mode === "file" ? (
        <div className="space-y-3">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={handleFileChange}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="w-full rounded-2xl border-2 border-dashed border-sky-200 bg-sky-50/50 px-4 py-8 text-sm font-semibold text-sky-800 transition hover:border-sky-400 hover:bg-sky-50 cursor-pointer"
          >
            {t("qrScanChooseImage")}
          </button>
        </div>
      ) : null}
    </div>
  );
}
