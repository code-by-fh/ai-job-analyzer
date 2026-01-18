import ReactMarkdown from 'react-markdown';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  content: string;
  jobId: string; // NEU: Wir brauchen die JobID für den Download Link
}

// Update Props oben
export default function ApplicationModal({ isOpen, onClose, content, jobId }: Props) {
  if (!isOpen) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(content);
    alert("In die Zwischenablage kopiert!");
  };

  // NEU: Download Funktion
  const handleDownload = async () => {
    try {
      const res = await fetch(`http://localhost:8002/jobs/${jobId}/download`);
      if (!res.ok) throw new Error("Download fehlgeschlagen");
      
      // Blob erstellen und virtuellen Link klicken
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Bewerbung.pdf`; // Fallback Name
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (e) {
      alert("Fehler beim PDF Download.");
      console.error(e);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col animate-in fade-in zoom-in duration-200">
        
        {/* Header */}
        <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50 rounded-t-xl">
          <h3 className="font-bold text-lg text-slate-800">📝 Anschreiben Vorschau</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-2xl leading-none cursor-pointer">&times;</button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-12 bg-white">
            <div className="prose prose-slate max-w-none prose-p:text-slate-800 prose-headings:text-slate-900 font-serif">
              <ReactMarkdown>{content}</ReactMarkdown>
            </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-100 flex gap-3 justify-end bg-slate-50 rounded-b-xl">
          <button onClick={onClose} className="px-4 py-2 text-slate-600 hover:bg-slate-200 rounded-lg font-medium cursor-pointer">
            Schließen
          </button>
          
          <button onClick={handleCopy} className="px-4 py-2 bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 rounded-lg font-medium cursor-pointer">
            📋 Text kopieren
          </button>

          {/* NEU: PDF Button */}
          <button 
            onClick={handleDownload}
            className="px-4 py-2 bg-indigo-600 text-white hover:bg-indigo-700 rounded-lg shadow-sm transition font-medium flex items-center gap-2 cursor-pointer"
          >
            📄 Als PDF speichern
          </button>
        </div>
      </div>
    </div>
  );
}