import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "@/locales/en.json";
import ne from "@/locales/ne.json";

/**
 * UI translations. Add keys to both src/locales/en.json and ne.json.
 * Missing Nepali keys fall back to English.
 */
void i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, ne: { translation: ne } },
  lng: "en",
  fallbackLng: "en",
  interpolation: { escapeValue: false },
});

export default i18n;
