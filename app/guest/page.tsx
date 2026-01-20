'use client';
import { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';

// 👇 請確認這是你 Railway 後端的正確網址 (https 開頭)
const BACKEND_URL = "https://event-saas-backend-production.up.railway.app";
const socket = io(BACKEND_URL);

// 1. 定義資料型別
interface Person {
  id: number;
  name: string;
}

interface Face {
  id: number;
  boundingBox: number[];
  confidence: number;
  person?: Person; 
}

interface Photo {
  id: number;
  url: string;
  originalUrl?: string; // 原圖網址
  status: string;
  faces: Face[];
}

// --------------------------------------------------------
// 2. PhotoCard 組件
// --------------------------------------------------------
const PhotoCard = ({ 
  photo, 
  viewMode, 
  onNameFace, 
  onSearchPerson,
  onConfirmDelete 
}: { 
  photo: Photo, 
  viewMode: 'framed' | 'original', 
  onNameFace: (faceId: number, currentName?: string) => void,
  onSearchPerson: (name: string) => void,
  onConfirmDelete: (photoId: number) => void 
}) => {
  const [imgSize, setImgSize] = useState({ width: 0, height: 0 });
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    if (imgRef.current?.complete) {
       setImgSize({
         width: imgRef.current.naturalWidth,
         height: imgRef.current.naturalHeight
       });
    }
  }, []); 

  return (
    <div className="bg-white rounded-xl shadow-md overflow-hidden hover:shadow-xl transition duration-300 group">
      <div className="relative">
        {photo.status === 'COMPLETED' || photo.status === 'Reference' ? (
          <div className="relative">
            {/* 標籤顯示目前模式 */}
            <div className="absolute top-2 left-2 z-20 bg-black/40 text-white text-[10px] px-1.5 py-0.5 rounded backdrop-blur-sm pointer-events-none">
               {viewMode === 'original' ? 'RAW' : 'FRAME'}
            </div>

            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img 
              ref={imgRef}
              src={viewMode === 'original' && photo.originalUrl ? photo.originalUrl : photo.url}
              alt="Event" 
              className="w-full h-auto block"
              onLoad={(e) => {
                setImgSize({ width: e.currentTarget.naturalWidth, height: e.currentTarget.naturalHeight });
              }}
            />
            
            {/* 人臉框繪製 */}
            {imgSize.width > 0 && photo.faces && photo.faces.map((face, idx) => {
              if (!Array.isArray(face.boundingBox) || face.boundingBox.length < 4) return null;

              const [x1, y1, x2, y2] = face.boundingBox;
              const safeW = imgSize.width || 1;
              const safeH = imgSize.height || 1;
              
              const style = {
                left: `${(x1 / safeW) * 100}%`,
                top: `${(y1 / safeH) * 100}%`,
                width: `${((x2 - x1) / safeW) * 100}%`,
                height: `${((y2 - y1) / safeH) * 100}%`,
              };

              return (
                <div
                  key={idx}
                  className="absolute border-2 border-green-400 shadow-[0_0_8px_rgba(74,222,128,0.8)] z-10 cursor-pointer hover:border-blue-400 hover:scale-105 transition-all"
                  style={style}
                  onClick={(e) => {
                    e.stopPropagation(); 
                    onNameFace(face.id, face.person?.name);
                  }}
                  title="點擊輸入名字"
                >
                  {face.person && (
                    <div 
                      className="absolute -top-6 left-0 bg-blue-600 text-white text-[10px] px-2 py-0.5 rounded shadow-sm whitespace-nowrap z-20 cursor-pointer hover:bg-blue-800 transition-colors"
                      onClick={(e) => {
                        e.stopPropagation(); 
                        onSearchPerson(face.person!.name); 
                      }}
                    >
                      🔍 {face.person.name}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="aspect-[4/3] bg-gray-50 flex flex-col items-center justify-center text-gray-400 animate-pulse">
             <span className="text-xs font-medium">AI 分析中...</span>
          </div>
        )}
        
        {/* 刪除按鈕 */}
        <button 
          onClick={(e) => {
            e.stopPropagation();
            onConfirmDelete(photo.id);
          }}
          className="absolute top-2 right-2 bg-red-600/80 hover:bg-red-600 text-white p-1.5 rounded-full shadow-md opacity-0 group-hover:opacity-100 transition-opacity z-30"
          title="刪除照片"
        >
          🗑️
        </button>
      </div>

      <div className="px-4 py-3 border-t border-gray-100 flex justify-between items-center bg-white">
         <span className="text-[10px] font-mono text-gray-400">ID: {photo.id}</span>
         <div className="flex gap-2 overflow-x-auto">
            {photo.faces?.map((f, i) => f.person ? (
                <span 
                  key={i} 
                  className="text-[10px] font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded cursor-pointer hover:bg-blue-100"
                  onClick={() => onSearchPerson(f.person!.name)}
                >
                    {f.person.name}
                </span>
            ) : null)}
         </div>
      </div>
    </div>
  );
};

// --------------------------------------------------------
// 3. Home 主程式
// --------------------------------------------------------
export default function Home() {
  const [uploading, setUploading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [isSearchResult, setIsSearchResult] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');
  const [deleteTargetId, setDeleteTargetId] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<'framed' | 'original'>('framed');

  const loadAllPhotos = () => {
    setIsSearchResult(false);
    fetch(`${BACKEND_URL}/photos`)
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) setPhotos(data);
      })
      .catch(err => console.error(err));
  };

  useEffect(() => {
    loadAllPhotos();
  }, []);

  useEffect(() => {
    const handleNewPhoto = (newPhoto: Photo) => {
      if (!isSearchResult) {
        setPhotos(prev => {
          const current = Array.isArray(prev) ? prev : [];
          if (current.some(p => p.id === newPhoto.id)) return current;
          return [newPhoto, ...current];
        });
      }
    };
    
    const handlePhotoDeleted = (deletedId: number) => {
        setPhotos(prev => prev.filter(p => p.id !== deletedId));
    };

    socket.on('new_photo_ready', handleNewPhoto);
    socket.on('photo_deleted', handlePhotoDeleted);

    return () => { 
        socket.off('new_photo_ready', handleNewPhoto); 
        socket.off('photo_deleted', handlePhotoDeleted);
    };
  }, [isSearchResult]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setUploadProgress(`正在上傳第 ${i + 1} / ${files.length} 張...`);
        const formData = new FormData();
        formData.append('photo', file);
        try {
            await fetch(`${BACKEND_URL}/upload`, { method: 'POST', body: formData });
        } catch (error) {
            console.error(`上傳失敗: ${file.name}`);
        }
    }
    setUploading(false);
    setUploadProgress('');
    if (!isSearchResult) loadAllPhotos();
    e.target.value = ''; 
  };

  // 🔥 關鍵修正區塊：自拍搜尋 🔥
  const handleSearch = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.[0]) return;
    setSearching(true);
    const formData = new FormData();
    formData.append('selfie', e.target.files[0]); // 注意：後端接收的欄位名稱是 'selfie'

    try {
      // ✅ 修正：這裡必須是 /guest-search (對應後端 index.js)
      const res = await fetch(`${BACKEND_URL}/guest-search`, { 
          method: 'POST', 
          body: formData 
      });
      
      const results = await res.json();
      
      if (res.ok && Array.isArray(results)) {
        setPhotos(results);
        setIsSearchResult(true);
      } else { 
        // 顯示後端回傳的錯誤訊息
        alert(results.error || '搜尋發生錯誤'); 
      }
    } catch (error: any) { 
        console.error(error); 
        // 顯示詳細錯誤，方便除錯
        alert(`連線失敗: ${error.message || JSON.stringify(error)}`); 
    } finally { 
        setSearching(false); 
        e.target.value = ''; 
    }
  };

  const handleNameFace = async (faceId: number, currentName?: string) => {
    const newName = prompt("請輸入這位參加者的名字：", currentName || "");
    if (!newName || newName === currentName) return;
    try {
      const res = await fetch(`${BACKEND_URL}/name`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ faceId, name: newName })
      });
      if (res.ok) loadAllPhotos();
      else alert("命名失敗");
    } catch (error) { alert("連線錯誤"); }
  };

  const handleSearchPerson = async (name: string) => {
    setSearching(true);
    try {
      const res = await fetch(`${BACKEND_URL}/person/${encodeURIComponent(name)}`);
      const results = await res.json();
      if (Array.isArray(results)) {
        setPhotos(results);
        setIsSearchResult(true);
      }
    } catch (error) { console.error(error); alert("搜尋名字失敗"); } 
    finally { setSearching(false); }
  };

  const executeDelete = async () => {
    if (!deleteTargetId) return;
    try {
        const res = await fetch(`${BACKEND_URL}/photo/${deleteTargetId}`, { method: 'DELETE' });
        if (!res.ok) alert("刪除失敗");
        setDeleteTargetId(null);
    } catch (err) {
        alert("刪除連線錯誤");
    }
  };

  return (
    <main className="min-h-screen bg-slate-50 p-6 md:p-12 font-sans relative">
      <div className="max-w-7xl mx-auto">
        <header className="flex flex-col md:flex-row justify-between items-center mb-12 gap-6 bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
          <div className="flex items-center gap-4">
            <div className="bg-blue-600 text-white p-3 rounded-xl shadow-lg shadow-blue-200">
               <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
            </div>
            <div>
              <h1 className="text-2xl font-extrabold text-slate-800 tracking-tight cursor-pointer hover:text-blue-600 transition" onClick={loadAllPhotos}>
                Event AI <span className="text-blue-600">Pro</span>
              </h1>
              <p className="text-xs text-slate-400 font-medium">Face Recognition • Tagging • Search</p>
            </div>
            
            <div className="ml-4 flex bg-slate-100 p-1 rounded-lg">
                <button 
                  onClick={() => setViewMode('original')}
                  className={`px-3 py-1 text-xs font-bold rounded-md transition ${viewMode === 'original' ? 'bg-white text-blue-600 shadow' : 'text-slate-400 hover:text-slate-600'}`}
                >
                  原圖
                </button>
                <button 
                  onClick={() => setViewMode('framed')}
                  className={`px-3 py-1 text-xs font-bold rounded-md transition ${viewMode === 'framed' ? 'bg-white text-blue-600 shadow' : 'text-slate-400 hover:text-slate-600'}`}
                >
                  合成
                </button>
            </div>

            {isSearchResult && (
              <button onClick={loadAllPhotos} className="ml-4 px-4 py-1.5 bg-slate-100 text-slate-600 rounded-full text-xs font-bold hover:bg-slate-200 transition">✕ 清除搜尋</button>
            )}
          </div>

          <div className="flex gap-3 w-full md:w-auto">
            {/* 按鈕 1: 自拍找照片 */}
            <label className={`flex-1 md:flex-none cursor-pointer flex justify-center items-center gap-2 px-6 py-3.5 rounded-xl text-white font-bold shadow-lg shadow-purple-200 transition-all transform hover:-translate-y-0.5 active:scale-95 ${searching ? 'bg-purple-400' : 'bg-gradient-to-r from-purple-600 to-indigo-600 hover:to-indigo-700'}`}>
              <span>{searching ? 'AI 比對中...' : '自拍找照片'}</span> 
              <input 
                type="file" 
                accept="image/*" 
                capture="user" 
                onChange={handleSearch} 
                className="hidden" 
                disabled={searching || uploading} 
              />
            </label>

            {/* 按鈕 2: 批量上傳 */}
            <label className={`flex-1 md:flex-none cursor-pointer flex justify-center items-center gap-2 px-6 py-3.5 rounded-xl text-white font-bold shadow-lg shadow-blue-200 transition-all transform hover:-translate-y-0.5 active:scale-95 ${uploading ? 'bg-blue-400' : 'bg-gradient-to-r from-blue-600 to-cyan-600 hover:to-cyan-700'}`}>
              <span>{uploading ? uploadProgress : '批量上傳'}</span>
              <input type="file" onChange={handleUpload} className="hidden" accept="image/*" multiple disabled={searching || uploading} />
            </label>
          </div>
        </header>

        <div className="flex justify-between items-end mb-6 px-2">
          <h2 className="text-xl font-bold text-slate-800">
            {isSearchResult ? '🎯 搜尋結果' : '📸 照片列表'}
          </h2>
          <span className="text-xs font-mono text-slate-400">Total: {photos.length}</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {Array.isArray(photos) && photos.map((photo) => (
            <PhotoCard 
              key={photo.id} 
              photo={photo} 
              viewMode={viewMode}
              onNameFace={handleNameFace}
              onSearchPerson={handleSearchPerson}
              onConfirmDelete={(id) => setDeleteTargetId(id)}
            />
          ))}
        </div>
      </div>

      {deleteTargetId !== null && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-2 text-center">確定要刪除這張照片嗎？</h3>
            <p className="text-sm text-gray-500 mb-6 text-center">此動作無法復原。</p>
            <div className="flex gap-3 w-full">
              <button onClick={() => setDeleteTargetId(null)} className="flex-1 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg">取消</button>
              <button onClick={executeDelete} className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg">確認刪除</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}