'use client';
import { useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import Link from 'next/link'; // 👈 讓我們可以連結去登記頁

const BACKEND_URL = "https://event-saas-backend-production.up.railway.app";
const socket = io(BACKEND_URL);

interface Photo { id: number; url: string; originalUrl?: string; faces: any[]; }

export default function Home() {
  const [searching, setSearching] = useState(false);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [hasSearched, setHasSearched] = useState(false);

  // 接收新照片通知 (即時更新)
  useEffect(() => {
    socket.on('new_photo_ready', (newPhoto: Photo) => {
        // 如果使用者已經搜尋過，且新照片裡有他，這裡可以做即時推播
        // 但為了簡單，目前先不做自動插入，避免干擾
    });
    return () => { socket.off('new_photo_ready'); };
  }, []);

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
        setHasSearched(true);
      } else { alert(results.error || '找不到照片'); }
    } catch (error) { alert('連線失敗'); } 
    finally { setSearching(false); e.target.value = ''; }
  };

  return (
    <main className="min-h-screen bg-slate-900 font-sans text-slate-100">
      
      {/* 🟢 狀態 A: 還沒搜尋 (首頁) */}
      {!hasSearched && (
        <div className="flex flex-col items-center justify-center min-h-screen p-6 relative">
            <div className="z-10 text-center max-w-md w-full">
                <h1 className="text-4xl font-extrabold mb-4 text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-400">
                    活動照片搜尋
                </h1>
                <p className="text-slate-400 mb-8">
                    上傳一張自拍，AI 幫您找照片 📸
                </p>

                {/* 大搜尋按鈕 */}
                <label className={`block w-full cursor-pointer bg-slate-800 hover:bg-slate-700 border border-slate-600 rounded-2xl p-8 mb-6 transition ${searching ? 'opacity-50' : ''}`}>
                    <div className="text-4xl mb-2">🤳</div>
                    <div className="text-xl font-bold">{searching ? 'AI 正在搜尋...' : '點擊自拍 / 上傳'}</div>
                    <input type="file" accept="image/*" capture="user" onChange={handleSearch} className="hidden" disabled={searching} />
                </label>

                {/* 👇 這裡加一個連結，讓還沒登記的人可以去登記 */}
                <Link href="/register" className="text-sm text-slate-500 hover:text-blue-400 underline">
                    還沒登記資料？點此去登記
                </Link>
            </div>
        </div>
      )}

      {/* 🟢 狀態 B: 搜尋結果 (Gallery) */}
      {hasSearched && (
        <div className="p-4 md:p-8 max-w-7xl mx-auto">
            <header className="flex justify-between items-center mb-6 sticky top-4 z-50 bg-slate-900/80 backdrop-blur-md p-4 rounded-xl border border-slate-800">
                <h2 className="text-xl font-bold text-blue-400">搜尋結果 ({photos.length})</h2>
                <button onClick={() => { setHasSearched(false); setPhotos([]); }} className="px-4 py-2 bg-slate-800 rounded-lg text-sm">✕ 重新搜尋</button>
            </header>

            {photos.length === 0 ? (
                <div className="text-center py-20 text-slate-500">😢 找不到照片，試試別張自拍？</div>
            ) : (
                <div className="columns-2 md:columns-3 lg:columns-4 gap-4 space-y-4">
                    {photos.map(p => (
                        <div key={p.id} className="break-inside-avoid bg-white rounded-lg overflow-hidden relative group">
                            <img src={p.url} className="w-full h-auto block" loading="lazy" />
                            <a href={p.url} download className="absolute bottom-2 right-2 bg-black/50 text-white p-2 rounded-full backdrop-blur-sm">⬇️</a>
                        </div>
                    ))}
                </div>
            )}
        </div>
      )}
    </main>
  );
}