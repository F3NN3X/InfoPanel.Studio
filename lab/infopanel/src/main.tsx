import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";

interface CorpusProfile {
  id: string;
  file: string;
  bytes: number;
  entries: string[];
  skipped: string[];
}

function Lab() {
  const [corpus, setCorpus] = useState<CorpusProfile[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/corpus/index.json")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(setCorpus, (e: Error) => setError(e.message));
  }, []);

  return (
    <main>
      <h1>InfoPanel import lab</h1>
      {error && (
        <p>
          No corpus ({error}). Run <code>npm run lab:extract</code>.
        </p>
      )}
      {corpus && (
        <table>
          <thead>
            <tr>
              <th>Profile</th>
              <th>Entries</th>
              <th>Size</th>
            </tr>
          </thead>
          <tbody>
            {corpus.map((p) => (
              <tr key={p.id}>
                <td>{p.id}</td>
                <td>{p.entries.length}</td>
                <td>{(p.bytes / 1024).toFixed(0)} KB</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<Lab />);
