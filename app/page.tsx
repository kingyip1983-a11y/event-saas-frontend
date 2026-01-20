'use client';
import { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';

// 👇 請確認這是你 Railway 後端的正確網址 (必須是 https)
const BACKEND_URL = "https://event-saas-backend-production.up.railway.app";
const socket = io(BACKEND_URL);

// 資料型別定義
interface Person { id: number; name: string; }
interface Face { id: number; boundingBox: number[]; confidence: number; person?: Person; }
interface Photo { id: number; url: string; originalUrl?: string; status: string; faces: Face[]; }

// --------------------------------------------------------
// PhotoCard 組件
// --------------------------------------------------------
const PhotoCard = ({ photo, viewMode, onNameFace, onSearchPerson, onConfirmDelete }: any) => {
  const [imgSize, setImgSize] = useState({ width: 0, height: 0 });
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    if (imgRef.current?.complete) {
       setImgSize({ width: imgRef.current.naturalWidth, height: imgRef.current.naturalHeight });
    }
  }, []); 

  return (
    <div className="bg-white rounded-xl shadow-md overflow-hidden relative group">
      {/* 標籤 */}
      <div className="absolute top-2 left-2 z-20 bg-black/40 text-white text-[10px] px-1.5 py-0.5 rounded backdrop-blur-sm">
          {viewMode === 'original' ? 'RAW' : 'FRAME'}
      </div>

      <img 
        ref={imgRef}
        src={viewMode === 'original' && photo.originalUrl ? photo.originalUrl : photo.url}
        className="w-full h-auto block"
        onLoad={(e) => setImgSize({ width: e.currentTarget.naturalWidth, height: e.currentTarget.naturalHeight })}
      />
      
      {/* 人臉框 */}
      {imgSize.width > 0 && photo.faces?.map((face: Face, idx: number) => {
        const [x1, y1, x2, y2] = face.boundingBox;
        return (
          <div
            key={idx}
            className="absolute border-2 border-green-400 z-10 cursor-pointer hover:border-blue-400"
            style={{
              left: `${(x1 / imgSize.width) * 100}%`,
              top: `${(y1 / imgSize.height) * 100}%`,
              width: `${((x2 - x1) / imgSize.width) * 100}%`,
              height: `${((y2 - y1) / imgSize.height) * 100}%`,
            }}
            onClick={(e) => { e.stopPropagation(); onNameFace(face.id, face.person?.name); }}
          >
            {face.person && (
              <div className="absolute -top-6 left-0 bg-blue-600 text-white text-[10px] px-2 py-0.5 rounded">
                🔍 {face.person.name}
              </div>
            )}
          </div>
        );
      })}

      {/* 刪除按鈕 */}
      <button 
        onClick={(e) => { e.stopPropagation(); onConfirmDelete(photo.id); }}
        className="absolute top-2 right-2 bg-red-600 text-white p-1.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity z-30"
      >
        🗑️
      </button>
    </div>
  );
};

// --------------------------------------------------------
// 主程式 Home
// --------------------------------------------------------
export default function Home() {
  const [uploading, setUploading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [isSearchResult, setIsSearchResult] = useState(false);
  const [viewMode, setViewMode] = useState<'framed' | 'original'>('framed');
  const [deleteTargetId, setDeleteTargetId] = useState<number | null>(null);

  const loadAllPhotos = () => {
    setIsSearchResult(false);
    fetch(`${BACKEND_URL}/photos`)
      .then(res => res.json())
      .then(data => Array.isArray(data) && setPhotos(data))
      .catch(console.error);
  };

  useEffect(() => { loadAllPhotos(); }, []);

  useEffect(() => {
    socket.on('new_photo_ready', (newPhoto: Photo) => {
      if (!isSearchResult) setPhotos(prev => [newPhoto, ...prev]);
    });
    socket.on('photo_deleted', (id: number) => setPhotos(prev => prev.filter(p => p.id !== id)));
    return () => { socket.off('new_photo_ready'); socket.off('photo_deleted'); };
  }, [isSearchResult]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length) return;
    setUploading(true);
    for (let i = 0; i < e.target.files.length; i++) {
        const formData = new FormData();
        formData.append('photo', e.target.files[i]);
        await fetch(`${BACKEND_URL}/upload`, { method: 'POST', body: formData }).catch(console.error);
    }
    setUploading(false);
    if (!isSearchResult) loadAllPhotos();
    e.target.value = ''; 
  };

  // 🔥 關鍵修正：自拍搜尋 🔥
  const handleSearch = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.[0]) return;
    setSearching(true);
    const formData = new FormData();
    formData.append('selfie', e.target.files[0]);

    try {
      // ✅ 這裡必須是 /guest-search
      const res = await fetch(`${BACKEND_URL}/guest-search`, { method: 'POST', body: formData });
      const results = await res.json();
      
      if (res.ok && Array.isArray(results)) {
        setPhotos(results);
        setIsSearchResult(true);
      } else { 
        alert(results.error || '搜尋發生錯誤'); 
      }
    } catch (error: any) { 
        // ✅ 顯示詳細錯誤，不再只有「搜尋連線失敗」
        alert(`連線失敗: ${error.message || JSON.stringify(error)}`); 
    } finally { 
        setSearching(false); 
        e.target.value = ''; 
    }
  };

  // 刪除與命名功能
  const executeDelete = async () => {
    if (deleteTargetId) await fetch(`${BACKEND_URL}/photo/${deleteTargetId}`, { method: 'DELETE' });
    setDeleteTargetId(null);
  };
  const handleNameFace = async (faceId: number, name?: string) => {
    const newName = prompt("輸入名字", name || "");
    if (newName && newName !== name) {
      await fetch(`${BACKEND_URL}/name`, { 
        method: 'POST', 
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ faceId, name: newName }) 
      });
      loadAllPhotos();
    }
  };

  return (
    <main className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* 標題與按鈕區 */}
        <div className="flex flex-col md:flex-row justify-between items-center mb-8 bg-white p-4 rounded-xl shadow-sm">
          <h1 className="text-2xl font-bold text-slate-800 cursor-pointer" onClick={loadAllPhotos}>Event AI Pro</h1>
          
          <div className="flex gap-2 mt-4 md:mt-0">
             {/* 視角切換 */}
             <div className="flex bg-slate-100 p-1 rounded-lg mr-4">
                <button onClick={() => setViewMode('original')} className={`px-3 py-1 text-xs font-bold rounded ${viewMode==='original'?'bg-white shadow':''}`}>原圖</button>
                <button onClick={() => setViewMode('framed')} className={`px-3 py-1 text-xs font-bold rounded ${viewMode==='framed'?'bg-white shadow':''}`}>合成</button>
            </div>

            {/* 自拍搜尋按鈕 */}
            <label className={`cursor-pointer px-4 py-2 rounded-lg text-white font-bold ${searching ? 'bg-purple-400' : 'bg-purple-600'}`}>
              {searching ? 'AI處理中...' : '📸 自拍找照片'}
              <input type="file" accept="image/*" capture="user" onChange={handleSearch} className="hidden" disabled={searching} />
            </label>

            <label className="cursor-pointer px-4 py-2 rounded-lg text-white font-bold bg-blue-600">
              {uploading ? '上傳中...' : '📤 批量上傳'}
              <input type="file" multiple accept="image/*" onChange={handleUpload} className="hidden" disabled={uploading} />
            </label>
          </div>
        </div>

        {/* 照片列表 */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {photos.map(p => (
            <PhotoCard key={p.id} photo={p} viewMode={viewMode} onNameFace={handleNameFace} onConfirmDelete={setDeleteTargetId} />
          ))}
        </div>

        {/* 刪除確認視窗 */}
        {deleteTargetId && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white p-6 rounded-lg text-center">
              <h3 className="font-bold mb-4">確定刪除？</h3>
              <div className="flex gap-2">
                <button onClick={() => setDeleteTargetId(null)} className="px-4 py-2 bg-gray-200 rounded">取消</button>
                <button onClick={executeDelete} className="px-4 py-2 bg-red-600 text-white rounded">確認</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}