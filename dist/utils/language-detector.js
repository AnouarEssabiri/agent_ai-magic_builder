"use strict";
var __createBinding =
  (this && this.__createBinding) ||
  (Object.create
    ? function (o, m, k, k2) {
        if (k2 === undefined) k2 = k;
        var desc = Object.getOwnPropertyDescriptor(m, k);
        if (
          !desc ||
          ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)
        ) {
          desc = {
            enumerable: true,
            get: function () {
              return m[k];
            },
          };
        }
        Object.defineProperty(o, k2, desc);
      }
    : function (o, m, k, k2) {
        if (k2 === undefined) k2 = k;
        o[k2] = m[k];
      });
var __setModuleDefault =
  (this && this.__setModuleDefault) ||
  (Object.create
    ? function (o, v) {
        Object.defineProperty(o, "default", { enumerable: true, value: v });
      }
    : function (o, v) {
        o["default"] = v;
      });
var __importStar =
  (this && this.__importStar) ||
  (function () {
    var ownKeys = function (o) {
      ownKeys =
        Object.getOwnPropertyNames ||
        function (o) {
          var ar = [];
          for (var k in o)
            if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
          return ar;
        };
      return ownKeys(o);
    };
    return function (mod) {
      if (mod && mod.__esModule) return mod;
      var result = {};
      if (mod != null)
        for (var k = ownKeys(mod), i = 0; i < k.length; i++)
          if (k[i] !== "default") __createBinding(result, mod, k[i]);
      __setModuleDefault(result, mod);
      return result;
    };
  })();
import("franc").then((francModule) => {
  Object.defineProperty(exports, "__esModule", { value: true });
  exports.detectLanguage = detectLanguage;
  const langs = __importStar(require("langs"));

  const franc_1 = francModule.default || francModule;
  /**
   * Detect the language of a text document
   */
  async function detectLanguage(text) {
    try {
      // Get a sample of the text (first 1000 chars)
      const sample = text.substring(0, 1000);
      // Detect language code using franc
      const languageCode = (0, franc_1.franc)(sample);
      if (languageCode === "und") {
        return "unknown";
      }
      // Convert language code to full name
      const language = langs.where("3", languageCode);
      return language ? language.name : "unknown";
    } catch (error) {
      console.error("Language detection failed:", error);
      return "unknown";
    }
  }
});
