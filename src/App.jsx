/* src/App.jsx */
import { useState, useEffect, useRef } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import { GoogleGenerativeAI } from "@google/generative-ai";
import './App.css';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

// Cấu hình worker cho PDF (Bắt buộc)
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

// --- 1. ĐIỀN API KEY CỦA BẠN VÀO ĐÂY ---
const API_KEY = "AIzaSyCBn5eRpwQKRrDl1VLjl_mxoEETAoIIJAs"; 

const genAI = new GoogleGenerativeAI(API_KEY);
// Sử dụng model Flash (Nhanh và rẻ)
// Thử phương án B: Dùng tên phiên bản cụ thể của Flash
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
function App() {
  const [pdfFile, setPdfFile] = useState(null);
  const [numPages, setNumPages] = useState(null);
  const [pageNumber, setPageNumber] = useState(1);
  // Thêm loading để hiển thị trạng thái chờ
  const [popup, setPopup] = useState({ show: false, x: 0, y: 0, content: '', loading: false });

  const documentRef = useRef(null);
  const pdfWrapperRef = useRef(null); // Ref để tham chiếu wrapper

  // --- Xử lý tải file ---
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

  // --- Xử lý bôi đen text ---
  const handleMouseUp = async (event) => {
    // Nếu click ra ngoài vùng sách thì không làm gì
    if (!documentRef.current || !documentRef.current.contains(event.target)) {
        return;
    }
    
    const selection = window.getSelection();
    const text = selection.toString().trim();

    if (text && text.length > 0) {
      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();

      // Tính vị trí Popup (Quan trọng: Cần khớp với CSS)
      setPopup({
        show: true,
        x: rect.left + rect.width / 2, 
        y: rect.top + window.scrollY, 
        content: '',
        loading: true
      });

      // Gọi hàm dịch
      await askGemini(text);
    } else {
      // Nếu click mà không bôi đen chữ nào -> Đóng popup
      setPopup(prev => ({ ...prev, show: false }));
    }
  };

  // --- Gọi Gemini API (Đã tối ưu) ---
  const askGemini = async (selectedText) => {
    if (!API_KEY) {
        setPopup(prev => ({ ...prev, loading: false, content: "⚠️ Chưa có API Key!" }));
        return;
    }

    try {
      // Cập nhật Prompt: Hỗ trợ Anh/Hàn -> Việt + Nguồn gốc từ
      const prompt = `
        Bạn là từ điển đa ngôn ngữ (Anh-Việt và Hàn-Việt).
        Hãy phân tích từ/cụm từ: "${selectedText}" theo 3 ý sau:
        
        1. **Nghĩa tiếng Việt**: Định nghĩa ngắn gọn, súc tích.
        2. **Nguồn gốc**: Nêu sơ lược nguồn gốc (gốc Latin/Hy Lạp nếu là tiếng Anh, hoặc gốc Hán/Hanja nếu là tiếng Hàn).
        3. **Ví dụ**: Một câu ví dụ ngắn (kèm dịch nghĩa tiếng Việt).

        Lưu ý: Trình bày rõ ràng, dùng markdown (**in đậm** tiêu đề), tổng độ dài dưới 80 từ.
      `;

      // SỬA: Dùng generationConfig chuẩn để tránh lỗi 400
      const result = await model.generateContent({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { 
            temperature: 0.2,
        }
      });

      const response = await result.response;
      const text = response.text();

      setPopup(prev => ({ ...prev, loading: false, content: text }));

    } catch (error) {
      console.error("Lỗi API:", error);
      setPopup(prev => ({ ...prev, loading: false, content: "⚠️ Lỗi kết nối Gemini (Kiểm tra mạng/Key)." }));
    }
  };
  
  // Xử lý click ra ngoài để đóng popup
  useEffect(() => {
      const handleClickOutside = () => {
          const selection = window.getSelection();
          if (selection.toString().trim() === "" && popup.show) {
             setPopup(prev => ({ ...prev, show: false }));
          }
      }
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [popup.show]);


  return (
    <div className="app-container">
      <h1>📖 AI English Book Reader</h1>
      
      {!pdfFile && (
        <div className="upload-section">
          <input type="file" accept=".pdf" onChange={onFileChange} />
          <p>Chọn file sách PDF tiếng Anh để bắt đầu</p>
        </div>
      )}

      {pdfFile && (
        // QUAN TRỌNG: Class này giúp popup định vị đúng chỗ
        <div className="pdf-viewer-wrapper" ref={pdfWrapperRef}>
          
          <div className="pdf-container" ref={documentRef} onMouseUp={handleMouseUp}>
            <Document 
                file={pdfFile} 
                onLoadSuccess={onDocumentLoadSuccess}
                loading={<p>Đang tải sách...</p>}
            >
              <Page 
                pageNumber={pageNumber} 
                renderTextLayer={true} 
                renderAnnotationLayer={false}
                width={800} 
              />
            </Document>
          </div>

          {/* Điều hướng trang */}
          <div className="controls">
            <button disabled={pageNumber <= 1} onClick={() => setPageNumber(pageNumber - 1)}>
              &lt; Trước
            </button>
            <span className="page-info">Trang {pageNumber} / {numPages}</span>
            <button disabled={pageNumber >= numPages} onClick={() => setPageNumber(pageNumber + 1)}>
              Sau &gt;
            </button>
            <button 
              onClick={() => setPdfFile(null)} 
              style={{background: '#dc3545', marginLeft: '20px'}}
            >
              Đổi Sách
            </button>
          </div>

          {/* Popup Hiển thị nghĩa */}
          {popup.show && (
            <div 
              className="definition-popup" 
              style={{ 
                top: `${popup.y}px`, 
                left: `${popup.x}px`,
                transform: 'translate(-50%, -110%)', // Đẩy popup lên trên từ vựng
              }}
            >
              {popup.loading ? (
                <div className="popup-loading">Gemini đang dịch... ⏳</div>
              ) : (
                <div 
                    className="popup-content" 
                    dangerouslySetInnerHTML={{ 
                        __html: (typeof popup.content === 'string' ? popup.content : '')
                            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') // Xử lý in đậm markdown
                            .replace(/\n/g, '<br/>') // Xuống dòng
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