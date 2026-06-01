import { useTranslation } from "react-i18next";
import { QRCodeSVG } from "qrcode.react";
import logoImg from "../assets/logo.png";

export type TicketReceipt = {
  bookingReference?: string;
  establishmentName: string;
  establishmentAddress?: string;
  bookingDate?: string;
  startTime?: string;
  endTime?: string;
  clientFirstName?: string;
  clientLastName?: string;
  clientPhone?: string;
  secretCode?: string | null;
  totalPrice?: string;
  paymentStatus?: string;
  paymentStatusLabel?: string;
  qrText: string;
  createdAt?: string;
};

type TicketPrinterProps = {
  receipt: TicketReceipt;
  language?: "fr" | "ar";
  onPrint?: () => void;
  showPrintButton?: boolean;
  title?: string;
};

const THERMAL_WIDTH_MM = 80;

export function TicketPrinter({
  receipt,
  language,
  onPrint,
  showPrintButton = false,
  title,
}: TicketPrinterProps) {
  const { t, i18n } = useTranslation();
  const activeLanguage = language || (i18n.language === "ar" ? "ar" : "fr");
  const isArabic = activeLanguage === "ar";

  const createdLabel = receipt.createdAt
    ? new Date(receipt.createdAt).toLocaleString(activeLanguage, {
        year: "numeric",
        month: "short",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "-";

  const printReceipt = () => {
    onPrint?.();
    window.print();
  };

  return (
    <div dir={isArabic ? "rtl" : "ltr"} className="ticket-printer-shell">
      <div className="mx-auto flex justify-center overflow-auto rounded-[1.5rem] bg-slate-100 p-4">
        <article className="thermal-ticket bg-white px-4 py-5 text-[13px] leading-5 text-slate-900 shadow-lg">
          <header className="border-b border-dashed border-slate-300 pb-3 text-center flex flex-col items-center justify-center gap-2">
            <img src={logoImg} alt="logo" className="mx-auto h-12 w-auto" />
            <div>
              <p className="text-sm font-bold uppercase tracking-[0.35em] text-slate-900">Laverie de la residence</p>
              <p className="mt-1 text-xs text-slate-500">{title || t("ticketTitle")}</p>
            </div>
          </header>

          <section className="space-y-3 py-4 text-[12px]">
            <Line label={t("establishment")} value={receipt.establishmentName} rtl={isArabic} />
            {receipt.establishmentAddress ? <Line label={t("address")} value={receipt.establishmentAddress} rtl={isArabic} /> : null}
            {receipt.clientFirstName || receipt.clientLastName ? (
              <Line label={t("clientName")} value={`${receipt.clientFirstName || ""} ${receipt.clientLastName || ""}`.trim()} rtl={isArabic} />
            ) : null}
            {receipt.clientPhone ? <Line label={"Identifiant"} value={receipt.clientPhone} rtl={isArabic} /> : null}
            {receipt.secretCode ? <Line label={t("secretCode")} value={receipt.secretCode} rtl={isArabic} /> : null}
            <Line label={"Créé le"} value={createdLabel} rtl={isArabic} />
          </section>

          <div className="border-t border-dashed border-slate-300 py-3 text-center">
            <div className="mt-3 flex justify-center">
              <QRCodeSVG value={receipt.qrText} size={140} includeMargin level="H" />
            </div>
            <p className="mt-2 text-xs font-semibold text-slate-700">{t("ticketQrHint")}</p>
          </div>

          <footer className="border-t border-dashed border-slate-300 pt-3 text-center">
            <p className="text-[11px] text-slate-500">{t("ticketFooter")}</p>
          </footer>
        </article>
      </div>

      {showPrintButton ? (
        <div className="mt-4 flex justify-center">
          <button
            type="button"
            onClick={printReceipt}
            className="rounded-2xl bg-slate-900 px-5 py-3 font-semibold text-white transition hover:bg-slate-800"
          >
            {t("printReceipt")}
          </button>
        </div>
      ) : null}

      <style>{`
        .ticket-printer-shell {
          width: 100%;
        }

        .thermal-ticket {
          width: ${THERMAL_WIDTH_MM}mm;
          max-width: ${THERMAL_WIDTH_MM}mm;
          min-width: ${THERMAL_WIDTH_MM}mm;
          color-adjust: exact;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }

        @page {
          margin: 0;
        }

        @media print {
          html, body {
            margin: 0 !important;
            padding: 0 !important;
            background: #fff !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }

          body * {
            visibility: hidden;
          }

          .ticket-printer-shell,
          .ticket-printer-shell * {
            visibility: visible;
          }

          .ticket-printer-shell {
            position: absolute;
            inset: 0;
          }

          .thermal-ticket {
            position: absolute;
            left: 0;
            top: 0;
            width: ${THERMAL_WIDTH_MM}mm !important;
            max-width: ${THERMAL_WIDTH_MM}mm !important;
            min-width: ${THERMAL_WIDTH_MM}mm !important;
            margin: 0 !important;
            box-shadow: none !important;
            border: none !important;
            padding: 4mm !important;
          }

          .ticket-printer-shell button {
            display: none !important;
          }
        }
      `}</style>
    </div>
  );
}

function Line({ label, value, rtl = false }: { label: string; value: string; rtl?: boolean }) {
  return (
    <div className={`flex gap-3 ${rtl ? "flex-row-reverse" : ""}`}>
      <span className="min-w-[34%] text-slate-500">{label}</span>
      <span className={`flex-1 font-semibold text-slate-900 ${rtl ? "text-left" : "text-right"}`}>{value}</span>
    </div>
  );
}