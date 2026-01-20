'use client';
import { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';

// 👇 請確認這是你 Railway 後端的正確網址
const BACKEND_URL = "https://event-saas-backend-production.up.railway.app";
const socket = io(BACKEND_URL);

interface Person { id: number; name: string; }
interface Face { id: number; boundingBox: number[]; confidence: number; person?: Person; }
interface Photo { id: number; url: string; originalUrl?: string; status: string; faces: Face[]; }

// --------------------------------------------------------
// PhotoCard 組件 (保持不變，負責顯示照片)
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
    <div className="bg-white rounded-xl shadow-md overflow-hidden relative group break-inside-avoid mb-4">
      {/* 標籤 */}
      <div className="absolute top-2 left-2 z-20 bg-black/40 text-white text-[10px] px-1.5 py-0.5 rounded backdrop-blur-sm pointer-events-none">
          {viewMode === 'original' ? 'RAW' : 'FRAME'}
      </div>

      <img 
        ref={imgRef}
        src={viewMode === 'original' && photo.originalUrl ? photo.originalUrl : photo.url}
        className="w-full h-auto block"
        loading="lazy"
        onLoad={(e) => setImgSize({ width: e.currentTarget.naturalWidth, height: e.currentTarget.naturalHeight })}
      />
      
      {/* 下載按鈕 */}
      <a 
        href={photo.url} 
        download 
        target="_blank"
        className="absolute bottom-2 right-2 bg-white/30 hover:bg-white/50 text-white p-2 rounded-full backdrop-blur-md transition z-30"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
      </a>

      {/* 只有在開發模式或特定權限下才顯示刪除鈕，這裡先留著 */}
      <button 
        onClick={(e) => { e.stopPropagation(); onConfirmDelete(photo.id); }}
        className="absolute top-2 right-2 bg-red-600/80 text-white p-1.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity z-30"
      >
        🗑️
      </button>
    </div>
  );
};

// --------------------------------------------------------
// 主程式 Home (大幅改造：搜尋優先)
// --------------------------------------------------------
export default function Home() {
  const [uploading, setUploading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [photos, setPhotos] = useState<Photo[]>([]);
  
  // 🔥 新增：是否已經搜尋過？ (預設 false，這樣一進來就不會顯示照片)
  const [hasSearched, setHasSearched] = useState(false);
  
  const [viewMode, setViewMode] = useState<'framed' | 'original'>('framed');
  const [deleteTargetId, setDeleteTargetId] = useState<number | null>(null);

  // 初始化時建立 Socket 監聽，但「不」主動撈照片
  useEffect(() => {
    socket.on('new_photo_ready', (newPhoto: Photo) => {
      // 只有當使用者在看「全部照片」模式時，才即時推播新照片
      // 如果是「搜尋結果」模式，就不干擾
      if (hasSearched && photos.length > 0) { 
        // 這裡可以決定要不要自動加入，為了隱私，通常搜尋模式下不自動加別人的圖
      }
    });
    return () => { socket.off('new_photo_ready'); };
  }, [hasSearched, photos]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length) return;
    setUploading(true);
    for (let i = 0; i < e.target.files.length; i++) {
        const formData = new FormData();
        formData.append('photo', e.target.files[i]);
        await fetch(`${BACKEND_URL}/upload`, { method: 'POST', body: formData }).catch(console.error);
    }
    setUploading(false);
    alert("上傳完成！");
    e.target.value = ''; 
  };

  // 🔥 關鍵修正：自拍搜尋
  const handleSearch = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.[0]) return;
    setSearching(true);
    const formData = new FormData();
    formData.append('selfie', e.target.files[0]);

    try {
      const res = await fetch(`${BACKEND_URL}/guest-search`, { method: 'POST', body: formData });
      const results = await res.json();
      
      if (res.ok && Array.isArray(results)) {
        setPhotos(results);
        setHasSearched(true); // ✅ 標記為「已搜尋」，顯示結果頁
      } else { 
        alert(results.error || '搜尋發生錯誤'); 
      }
    } catch (error: any) { 
        alert(`連線失敗: ${error.message || JSON.stringify(error)}`); 
    } finally { 
        setSearching(false); 
        e.target.value = ''; 
    }
  };

  const executeDelete = async () => {
    if (deleteTargetId) await fetch(`${BACKEND_URL}/photo/${deleteTargetId}`, { method: 'DELETE' });
    setDeleteTargetId(null);
    setPhotos(prev => prev.filter(p => p.id !== deleteTargetId));
  };

  // 重置回首頁
  const resetSearch = () => {
    setPhotos([]);
    setHasSearched(false);
  };

  return (
    <main className="min-h-screen bg-slate-900 font-sans text-slate-100">
      
      {/* -------------------------------------------
          情境 A: 還沒搜尋 (首頁 - 隱私模式)
          顯示大大的搜尋按鈕，不顯示任何照片
      ------------------------------------------- */}
      {!hasSearched && (
        <div className="flex flex-col items-center justify-center min-h-screen p-6 relative overflow-hidden">
            {/* 背景裝飾 */}
            <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-slate-800 via-slate-900 to-black z-0"></div>
            
            <div className="relative z-10 text-center max-w-md w-full">
                <div className="mb-8 inline-block p-4 bg-blue-600/20 rounded-full">
                    <svg className="w-12 h-12 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                </div>
                <h1 className="text-4xl font-extrabold mb-4 bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-400">
                    尋找您的活動照片
                </h1>
                <p className="text-slate-400 mb-10 text-lg">
                    上傳一張自拍，AI 將立即從活動相簿中找出屬於您的精彩瞬間。
                </p>

                {/* 大搜尋按鈕 */}
                <label className={`block w-full cursor-pointer group relative overflow-hidden rounded-2xl p-[2px] transition-all hover:scale-105 active:scale-95 ${searching ? 'opacity-70' : ''}`}>
                    <span className="absolute inset-[-1000%] animate-[spin_2s_linear_infinite] bg-[conic-gradient(from_90deg_at_50%_50%,#E2E8F0_0%,#393BB2_50%,#E2E8F0_100%)]" />
                    <span className="inline-flex h-full w-full cursor-pointer items-center justify-center rounded-2xl bg-slate-950 px-8 py-6 text-xl font-medium text-white backdrop-blur-3xl transition-all group-hover:bg-slate-900">
                        {searching ? (
                             <span className="flex items-center gap-2">
                                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                                AI 正在搜尋...
                             </span>
                        ) : (
                            <span className="flex items-center gap-3">
                                📸 開始自拍搜尋
                            </span>
                        )}
                    </span>
                    <input type="file" accept="image/*" capture="user" onChange={handleSearch} className="hidden" disabled={searching} />
                </label>

                {/* 攝影師入口 (隱藏式或小按鈕) */}
                <div className="mt-12 pt-8 border-t border-slate-800">
                    <label className="text-sm text-slate-500 hover:text-slate-300 cursor-pointer transition">
                        我是攝影師 / 上傳照片
                        <input type="file" multiple accept="image/*" onChange={handleUpload} className="hidden" disabled={uploading} />
                    </label>
                </div>
            </div>
        </div>
      )}

      {/* -------------------------------------------
          情境 B: 搜尋結果頁 (Result Page)
          只顯示找到的照片
      ------------------------------------------- */}
      {hasSearched && (
        <div className="max-w-7xl mx-auto p-4 md:p-8">
            <header className="flex flex-col md:flex-row justify-between items-center mb-8 gap-4 bg-slate-800/50 p-4 rounded-2xl border border-slate-700 backdrop-blur-md sticky top-4 z-50">
                <h2 className="text-xl font-bold flex items-center gap-2">
                    <span onClick={resetSearch} className="cursor-pointer hover:text-blue-400 transition">
                        Event Gallery
                    </span>
                    <span className="text-slate-500">/</span>
                    <span className="text-blue-400">搜尋結果 ({photos.length})</span>
                </h2>
                
                <div className="flex gap-3">
                    <button onClick={resetSearch} className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm font-bold transition">
                        ✕ 重新搜尋
                    </button>
                    {/* 視角切換 */}
                    <div className="flex bg-slate-900 p-1 rounded-lg">
                        <button onClick={() => setViewMode('original')} className={`px-3 py-1 text-xs rounded transition ${viewMode==='original'?'bg-slate-700 text-white':'text-slate-400'}`}>原圖</button>
                        <button onClick={() => setViewMode('framed')} className={`px-3 py-1 text-xs rounded transition ${viewMode==='framed'?'bg-blue-600 text-white':'text-slate-400'}`}>合成</button>
                    </div>
                </div>
            </header>

            {photos.length === 0 ? (
                <div className="text-center py-20 text-slate-500">
                    <p className="text-lg">😢 找不到您的照片</p>
                    <button onClick={resetSearch} className="mt-4 text-blue-400 hover:underline">試試別張自拍？</button>
                </div>
            ) : (
                <div className="columns-2 md:columns-3 lg:columns-4 gap-4 space-y-4">
                    {photos.map(p => (
                        <PhotoCard 
                            key={p.id} 
                            photo={p} 
                            viewMode={viewMode} 
                            onNameFace={() => {}} 
                            onConfirmDelete={setDeleteTargetId} 
                            onSearchPerson={() => {}}
                        />
                    ))}
                </div>
            )}
        </div>
      )}

      {/* 刪除確認視窗 (維持原樣) */}
      {deleteTargetId && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700 p-6 rounded-2xl text-center max-w-sm w-full mx-4">
            <h3 className="font-bold text-white mb-2 text-lg">確定刪除？</h3>
            <p className="text-slate-400 text-sm mb-6">此動作無法復原</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteTargetId(null)} className="flex-1 px-4 py-3 bg-slate-800 hover:bg-slate-700 rounded-xl font-bold transition">取消</button>
              <button onClick={executeDelete} className="flex-1 px-4 py-3 bg-red-600 hover:bg-red-500 text-white rounded-xl font-bold transition shadow-lg shadow-red-900/20">確認刪除</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}