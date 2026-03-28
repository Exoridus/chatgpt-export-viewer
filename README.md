<div align="center">

<a name="top"></a>
# ChatGPT Data Export Viewer

[![Release](https://img.shields.io/github/v/release/Exoridus/chatgpt-export-viewer?sort=semver&display_name=release&style=for-the-badge&logo=git&logoColor=fff&label=Release&labelColor=1a1e23&color=blue)](https://github.com/Exoridus/chatgpt-export-viewer/releases/latest)
[![Checks](https://img.shields.io/github/actions/workflow/status/Exoridus/chatgpt-export-viewer/ci-cd.yml?style=for-the-badge&label=Checks&logo=githubactions&logoColor=ffffff&labelColor=1a1e23)](https://github.com/Exoridus/chatgpt-export-viewer/actions/workflows/ci-cd.yml)
[![Live Demo](https://img.shields.io/badge/Live%20Demo-1a1e23?style=for-the-badge&logo=github)](https://exoridus.github.io/chatgpt-export-viewer/)

[**English**](#en) | [**Deutsch**](#de)

</div>

---

<a name="en"></a>
## English

A high-performance, privacy-focused Single Page Application (SPA) designed to browse, search, and archive ChatGPT data exports. It processes massive raw exports into a lightning-fast, searchable local database.

### 🛠 Workflows

#### A. Local Setup (Persistent & Independent)
This is the recommended approach for long-term archival. Data is stored on your local filesystem, ensuring full independence from browser sessions.

1.  **Download Assets:** Obtain the latest `chatgpt-export-viewer-v*.zip` from the [Releases](https://github.com/Exoridus/chatgpt-export-viewer/releases/latest) page.
2.  **Conversion:** 
    *   Place your ChatGPT `export.zip` files in the root directory and run `import-dataset`.
    *   Alternatively, drag and drop the export ZIPs directly onto the `import-dataset` executable.
3.  **Deployment:** Open `index.html`. For proper asset resolution (images/audio), we recommend serving via a static web server:
    ```bash
    npx serve .
    ```

#### B. Web Importer (Stateless / Sandbox)
Use the [Live Demo](https://exoridus.github.io/chatgpt-export-viewer/) for quick inspections without local installation.

*   **Storage:** Data is persisted in the browser's IndexedDB.
*   **Portability:** Use the **"Download Viewer Bundle"** feature inside the app to export your database into a fully functional **Local Setup** at any time.

### 🚀 Technical Features
*   **Trigram Search:** Instant, full-text search across thousands of conversations.
*   **Asset Management:** Automatic extraction and linking of DALL-E images and voice recordings.
*   **Multi-Export Merge:** Seamlessly combine multiple ChatGPT exports into a single unified view.
*   **CLI Tooling:** Zero-dependency `import-dataset` binary for cross-platform data processing.

---

<a name="de"></a>
## Deutsch

Eine performante, datenschutzorientierte Single Page Application (SPA) zum Durchsuchen und Archivieren von ChatGPT-Datenexporten. Rohe Exporte werden in eine extrem schnelle, lokal durchsuchbare Datenbank konvertiert.

### 🛠 Workflows

#### A. Lokale Einrichtung (Persistent & Unabhängig)
Empfohlener Ansatz für die langfristige Archivierung. Die Daten werden lokal gespeichert, was eine vollständige Unabhängigkeit von Browsersitzungen garantiert.

1.  **Download:** Laden Sie das aktuelle `chatgpt-export-viewer-v*.zip` von der [Releases](https://github.com/Exoridus/chatgpt-export-viewer/releases/latest) Seite herunter.
2.  **Konvertierung:** 
    *   Platzieren Sie Ihre ChatGPT `export.zip` Dateien im Stammverzeichnis und führen Sie `import-dataset` aus.
    *   Alternativ können Sie die Export-ZIPs direkt per Drag-and-Drop auf die `import-dataset` Datei ziehen.
3.  **Anzeige:** Öffnen Sie die `index.html`. Für die korrekte Anzeige von Medien (Bilder/Audio) wird ein lokaler Webserver empfohlen:
    ```bash
    npx serve .
    ```

#### B. Web-Importer (Stateless / Sandbox)
Nutzen Sie die [Live Demo](https://exoridus.github.io/chatgpt-export-viewer/) für schnelle Inspektionen ohne lokale Installation.

*   **Speicherung:** Daten werden in der IndexedDB des Browsers gesichert.
*   **Portabilität:** Nutzen Sie die Funktion **"Viewer-Bundle herunterladen"**, um Ihre Browser-Daten jederzeit in eine vollwertige **Lokale Einrichtung** zu exportieren.

### 🚀 Technische Features
*   **Trigram-Suche:** Sofortige Volltextsuche über tausende Unterhaltungen hinweg.
*   **Asset-Management:** Automatische Extraktion und Verknüpfung von DALL-E Bildern und Sprachaufnahmen.
*   **Multi-Export Merge:** Mehrere ChatGPT-Exporte können nahtlos in einer Ansicht zusammengeführt werden.
*   **CLI-Tooling:** Abhängigkeitsfreies `import-dataset` Binary für plattformübergreifende Datenverarbeitung.

---

**[Back to Top](#top)**
