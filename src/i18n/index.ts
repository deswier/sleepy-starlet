import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import en from "./en";
import ru from "./ru";

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: { en: { translation: en }, ru: { translation: ru } },
    fallbackLng: "en",
    supportedLngs: ["en", "ru"],
    interpolation: { escapeValue: false },
    detection: { order: ["localStorage", "navigator"], caches: ["localStorage"] },
    returnEmptyString: false,
    returnNull: false,
    parseMissingKeyHandler: (key) => {
      // Never show raw dotted keys in the UI: fall back to last segment, prettified
      const last = key.split(".").pop() || key;
      return last.replace(/[_-]+/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2");
    },
  });

export default i18n;
