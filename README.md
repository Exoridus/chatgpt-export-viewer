<div align="center">

# ChatGPT Data Export Viewer

[![Release](https://img.shields.io/github/v/release/Exoridus/chatgpt-export-viewer?sort=semver&display_name=release&style=for-the-badge&logo=git&logoColor=fff&label=Release&labelColor=1a1e23&color=blue)](https://github.com/Exoridus/chatgpt-export-viewer/releases/latest)
[![Checks](https://img.shields.io/github/actions/workflow/status/Exoridus/chatgpt-export-viewer/ci-cd.yml?style=for-the-badge&label=Checks&logo=githubactions&logoColor=ffffff&labelColor=1a1e23)](https://github.com/Exoridus/chatgpt-export-viewer/actions/workflows/ci-cd.yml)
[![Live Demo](https://img.shields.io/badge/Live%20Demo-1a1e23?style=for-the-badge&logo=github)](https://exoridus.github.io/chatgpt-export-viewer/)
[![Sponsor](https://img.shields.io/badge/Sponsor-1a1e23?style=for-the-badge&logo=githubsponsors)](https://github.com/sponsors/Exoridus)

</div>

## About This Project

This project was developed to address the challenge of efficiently viewing and managing large ChatGPT data exports. The raw export format, while comprehensive, is often unwieldy due to its massive JSON file size and embedded assets, making it difficult to navigate and use for analysis or archiving. This SPA aims to provide a user-friendly interface that converts these exports into a more accessible, optimized, and searchable format, enhancing the usability of your chat history.

## Live Demo

A live, hosted version of this application is available at:
https://exoridus.github.io/chatgpt-export-viewer/

This live demo does not store your imported datasets locally. However, it fully supports importing your ChatGPT data export `.zip` files directly into the browser.

## Features

*   **Import ChatGPT Data Exports:** Process official ChatGPT data exports (typically `.zip` archives).
*   **View Conversations:** Browse, search, and interact with your imported conversations.
*   **Blazing Fast Search:** Trigram-powered search palette with instant results and jump-to-hit navigation on click.
*   **Asset Gallery:** A dedicated gallery page displaying all referenced asset files and generated outputs in a grid view, grouped by whether they still appear in a conversation.
*   **Optimize & Convert Data:** Transform large, unwieldy JSON exports into smaller, optimized, and easily manageable conversation files.
*   **Export Processed Data:** Export converted conversations as a `.zip` archive, ready for local extraction.

## Getting Started

### Easiest Setup (For Non-Developers)

For users who want the simplest way to view their ChatGPT data locally without any build steps:

1.  **Download the release zip:** Get the latest `chatgpt-export-viewer-v*.zip` from the [GitHub Releases](https://github.com/Exoridus/chatgpt-export-viewer/releases/latest) page. This zip contains the fully pre-built SPA, including the `import-dataset` binary.
2.  **Extract:** Unzip it to a directory of your choice — the contents will be inside a `chatgpt-export-viewer/` folder.
3.  **Serve Locally:** For the best experience and to avoid potential issues with file loading, serve the extracted directory using a simple static web server:
    ```bash
    # Install if you don't have it: npm install -g serve
    serve chatgpt-export-viewer
    ```
    Then navigate to the local URL provided by `serve` (e.g., `http://localhost:3000`).

**Using the SPA:**
*   Once loaded, you can import your ChatGPT data export `.zip` file directly through the web interface. This import is temporary and will be lost upon page reload.
*   While in this temporary state, the SPA displays your conversations. You can then use the built-in export function to create a new `.zip` archive containing the processed conversations. This new zip can be extracted into the `chatgpt-export-viewer/conversations/` directory for permanent local access, allowing you to view your data offline without needing to run any command-line tools.

### Advanced Setup (For Developers & Contributors)

This setup involves using source files or the `import-dataset` binary for a more flexible local development or data processing workflow.

**Understanding ChatGPT Exports:**
ChatGPT data exports (e.g., `your-chatgpt-export.zip`) typically contain:
*   Microphone recordings and uploaded/generated images.
*   A single, very large JSON file (often 100-300+ MB) containing all conversations and metadata. This raw JSON is impractical for direct editing or efficient use.
*   A static HTML file that embeds the same large JSON content within a header script, which is also too large and difficult to manage.

**The `import-dataset` Binary:**
This cross-platform, zero-dependency executable was developed to address the challenges of raw ChatGPT exports. It:
*   Converts the giant `conversation.json` file into individual conversation files, each organized within its own directory.
*   Stores associated asset files (recordings, images) alongside their respective conversations.
*   Optimizes and converts conversations into smaller, readable, and searchable JSON objects.

You can download this binary as a standalone tool from the [GitHub Releases](https://github.com/Exoridus/chatgpt-export-viewer/releases/latest) page for direct conversion of your ChatGPT data export zip. When you build the application locally from source, this binary is also compiled and included within the `dist/` directory.

**Workflow 1: Using the `import-dataset` Binary**

1.  **Download Binary:** Get the `import-dataset` binary from the [GitHub Releases](https://github.com/Exoridus/chatgpt-export-viewer/releases/latest) page.
2.  **Run Conversion:** Execute the binary from your terminal, pointing it to your export zip and a target output directory:
    ```bash
    ./import-dataset --out ./chatgpt-export-viewer your-export.zip
    ```
    This writes `conversations.json`, `conversations/<id>/`, `assets/`, and `search_index.json` directly into the target directory.
3.  **Serve and View:** Serve the output directory with a static web server (e.g., `npx serve chatgpt-export-viewer`). Your converted conversations will be loaded automatically.

**Workflow 2: Building from Source (for Contributors/Forkers)**

If you are contributing to the project or making local modifications, you would typically build the application from source. The resulting `dist/` directory will contain the pre-built SPA, and the `import-dataset` binary will also be available within it. You can then follow the steps in Workflow 1, or utilize the SPA's built-in import/export features for data conversion.

**Note:** The `chatgpt-export-viewer-v*.zip` file from releases is the result of the build process and is intended for users who do not need to modify or build the source code.
