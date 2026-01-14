/* src/App.jsx */
import { useState, useEffect, useRef } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from "@google/generative-ai"; // Import thêm cái này
import './App.css';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

// Cấu hình worker cho PDF
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

const API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
const genAI = new GoogleGenerativeAI(API_KEY);

// --- CẤU HÌNH QUAN TRỌNG ĐỂ 1.5 FLASH CHẠY ĐƯỢC ---
const model = genAI.getGenerativeModel({ 
  model: "gemini-1.5-flash", // Bắt buộc dùng bản này mới không bị giới hạn 20 lần
  // Tắt toàn bộ bộ lọc an toàn để tránh bị lỗi "từ chối dịch"
  safetySettings: [
    { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
    { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
    { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
    { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
  ]
});

function App() {
  const [pdfFile, setPdfFile] = useState(null);
  const [numPages, setNumPages] = useState(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [popup, setPopup] = useState({ show: false, x: 0, y: 0, content: '', loading: false });

  const documentRef = useRef(null);
  const pdfWrapperRef = useRef(null);

  const onFileChange = (event) => {
    const file = event.target.files[0];
    if (file) {
      setPdfFile(file);
      setPageNumber(1);
      setPopup({ ...popup, show: false });
    }
  };

  function onDocumentLoadSuccess({ numPages }) {
    setNumPages(numPages);
  }

  // --- LOGIC MOBILE & PC (GIỮ NGUYÊN) ---
  const handleMouseUp = (event) => {
    if (documentRef.current && !documentRef.current.contains(event.target)) return;

    // setTimeout để sửa lỗi trên điện thoại
    setTimeout(async () => {
        const selection = window.getSelection();
        const text = selection ? selection.toString().trim() : "";

        if (text && text.length > 0) {
            console.log("Đã chọn:", text); 
            const range = selection.getRangeAt(0);
            const rect = range.getBoundingClientRect();

            setPopup({
                show: true,
                x: rect.left + rect.width / 2, 
                y: rect.top + window.scrollY, 
                content: '',
                loading: true
            });

            await askGemini(text);
        } 
    }, 300);
  };

  const askGemini = async (selectedText) => {
    if (!API_KEY) {
        setPopup(prev => ({ ...prev, loading: false, content: "⚠️ Thiếu API Key" }));
        return;
    }

    try {
      const prompt = `
        Bạn là từ điển. Giải thích từ: "${selectedText}"
        1. **Nghĩa tiếng Việt**: Ngắn gọn.
        2. **Gốc từ**: Nguồn gốc.
        3. **Ví dụ**: 1 câu ví dụ song ngữ.
        Dưới 80 từ.
      `;

      const result = await model.generateContent({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
      });

      const response = await result.response;
      const text = response.text();
      setPopup(prev => ({ ...prev, loading: false, content: text }));

    } catch (error) {
      console.error("Lỗi chi tiết:", error);
      // Hiển thị lỗi ra màn hình để biết tại sao 1.5 không chạy
      setPopup(prev => ({ 
          ...prev, 
          loading: false, 
          content: `⚠️ Lỗi: ${error.message || "Không xác định"}` 
      }));
    }
  };
  
  // Đóng popup khi bấm ra ngoài
  useEffect(() => {
      const handleClickOutside = () => {
          const selection = window.getSelection();
          if ((!selection || selection.toString().trim() === "") && popup.show) {
             setPopup(prev => ({ ...prev, show: false }));
          }
      }
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("touchstart", handleClickOutside);
      return () => {
          document.removeEventListener("mousedown", handleClickOutside);
          document.removeEventListener("touchstart", handleClickOutside);
      };
  }, [popup.show]);

  return (
    <div className="app-container">
      <h1>📖 AI English Book Reader</h1>
      {!pdfFile && (
        <div className="upload-section">
          <input type="file" accept=".pdf" onChange={onFileChange} />
          <p>Upload sách PDF để bắt đầu</p>
        </div>
      )}

      {pdfFile && (
        <div className="pdf-viewer-wrapper" ref={pdfWrapperRef}>
          <div className="pdf-container" ref={documentRef} onMouseUp={handleMouseUp} onTouchEnd={handleMouseUp}>
            <Document file={pdfFile} onLoadSuccess={onDocumentLoadSuccess} loading={<p>Đang tải...</p>}>
              <Page pageNumber={pageNumber} renderTextLayer={true} renderAnnotationLayer={false} width={800} />
            </Document>
          </div>

          <div className="controls">
            <button disabled={pageNumber <= 1} onClick={() => setPageNumber(pageNumber - 1)}>&lt; Trước</button>
            <span className="page-info">{pageNumber} / {numPages}</span>
            <button disabled={pageNumber >= numPages} onClick={() => setPageNumber(pageNumber + 1)}>Sau &gt;</button>
          </div>

          {popup.show && (
            <div className="definition-popup" style={{ top: `${popup.y}px`, left: `${popup.x}px`, transform: 'translate(-50%, -110%)' }}>
              {popup.loading ? ( <div className="popup-loading">Gemini 1.5 đang dịch... ⏳</div> ) : (
                <div className="popup-content" dangerouslySetInnerHTML={{ 
                        __html: (typeof popup.content === 'string' ? popup.content : '').replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br/>')
                    }} 
                />
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default App;
