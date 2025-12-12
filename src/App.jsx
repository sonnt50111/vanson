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

// --- SỬA 1: Dùng model 1.5-flash để ổn định và tránh lỗi Quota (429) ---
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

function App() {
  const [pdfFile, setPdfFile] = useState(null);
  const [numPages, setNumPages] = useState(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [popup, setPopup] = useState({ show: false, x: 0, y: 0, content: '', loading: false });

  const documentRef = useRef(null);
  const pdfWrapperRef = useRef(null);

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

  // --- SỬA 2: Xử lý bôi đen text (Thêm setTimeout cho Mobile) ---
  const handleMouseUp = (event) => {
    // Nếu click ra ngoài vùng sách thì không làm gì
    if (documentRef.current && !documentRef.current.contains(event.target)) {
        return;
    }

    // QUAN TRỌNG: Dùng setTimeout để chờ điện thoại hoàn tất việc bôi đen
    setTimeout(async () => {
        const selection = window.getSelection();
        const text = selection ? selection.toString().trim() : "";

        if (text && text.length > 0) {
            console.log("Đã chọn được chữ:", text); // Debug log

            // Lấy vị trí để hiện Popup
            const range = selection.getRangeAt(0);
            const rect = range.getBoundingClientRect();

            // Tính toán vị trí (cộng thêm scrollY để không bị lệch khi cuộn trang)
            setPopup({
                show: true,
                x: rect.left + rect.width / 2, 
                y: rect.top + window.scrollY, 
                content: '',
                loading: true
            });

            // Gọi hàm dịch
            await askGemini(text);
        } 
        // Lưu ý: Không cần 'else setPopup(false)' ở đây vì useEffect bên dưới đã lo việc đóng popup
    }, 300); // Chờ 0.3 giây (Thời gian đủ để điện thoại hiện menu copy xong)
  };

  // --- Gọi Gemini API ---
  const askGemini = async (selectedText) => {
    if (!API_KEY) {
        setPopup(prev => ({ ...prev, loading: false, content: "⚠️ Chưa có API Key!" }));
        return;
    }

    try {
      const prompt = `
        Bạn là từ điển đa ngôn ngữ (Anh-Việt và Hàn-Việt).
        Hãy phân tích từ/cụm từ: "${selectedText}" theo 3 ý sau:
        
        1. **Nghĩa tiếng Việt**: Định nghĩa ngắn gọn, súc tích.
        2. **Nguồn gốc**: Nêu sơ lược nguồn gốc (gốc Latin/Hy Lạp nếu là tiếng Anh, hoặc gốc Hán/Hanja nếu là tiếng Hàn).
        3. **Ví dụ**: Một câu ví dụ ngắn (kèm dịch nghĩa tiếng Việt).

        Lưu ý: Trình bày rõ ràng, dùng markdown (**in đậm** tiêu đề), tổng độ dài dưới 80 từ.
      `;

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
      setPopup(prev => ({ ...prev, loading: false, content: "⚠️ Lỗi kết nối Gemini (Hoặc hết hạn mức Free)." }));
    }
  };
  
  // --- SỬA 3: Xử lý click/chạm ra ngoài để đóng popup ---
  useEffect(() => {
      const handleClickOutside = () => {
          const selection = window.getSelection();
          // Nếu không có chữ nào được bôi đen và popup đang mở -> thì tắt popup
          if ((!selection || selection.toString().trim() === "") && popup.show) {
             setPopup(prev => ({ ...prev, show: false }));
          }
      }

      // Lắng nghe sự kiện chuột (PC)
      document.addEventListener("mousedown", handleClickOutside);
      // Lắng nghe sự kiện chạm (Mobile) - Cần thiết để tắt popup trên điện thoại
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
          <p>Chọn file sách PDF tiếng Anh để bắt đầu</p>
        </div>
      )}

      {pdfFile && (
        <div className="pdf-viewer-wrapper" ref={pdfWrapperRef}>
          
          {/* QUAN TRỌNG: Phải có cả onMouseUp và onTouchEnd */}
          <div className="pdf-container" ref={documentRef} onMouseUp={handleMouseUp} onTouchEnd={handleMouseUp}>
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
                            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                            .replace(/\n/g, '<br/>')
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