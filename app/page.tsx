'use client';

import { useState, useRef } from 'react';
import Link from 'next/link';

// 🔌 雙重變數偵測
const BACKEND_URL = 
  process.env.NEXT_PUBLIC_BACKEND_URL || 
  process.env.NEXT_PUBLIC_API_URL || 
  "https://event-saas-backend-production.up.railway.app";

export default function Home() {
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [photos, setPhotos] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 處理照片選擇
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setSelectedImage(file);
      setPreviewUrl(URL.createObjectURL(file));
      setSearched(false);
      setPhotos([]);
    }
  };

  // 執行搜尋
  const handleSearch = async () => {
    if (!selectedImage) return alert('請先選擇或拍攝照片');

    setIsSearching(true);
    setSearched(false);
    
    const formData = new FormData();
    formData.append('selfie', selectedImage);

    try {
        console.log(`🚀 正在搜尋: ${BACKEND_URL}/guest-search`);
        const res = await fetch(`${BACKEND_URL}/guest-search`, {
            method: 'POST',
            body: formData,
        });

        if (!res.ok) throw new Error('搜尋失敗');

        const data = await res.json();
        setPhotos(data);
    } catch (error) {
        console.error(error);
        alert('連線錯誤，請稍後再試');
    } finally {
        setIsSearching(false);
        setSearched(true);
    }
  };

  // 下載功能
  const downloadPhoto = async (photoId: number, url: string) => {
    try {
        fetch(`${BACKEND_URL}/analytics/track`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ photoId, type: 'DOWNLOAD' })
        });
    } catch (e) { console.error(e); }

    window.open(url, '_blank');
  };

  // 重置搜尋
  const resetSearch = () => {
      setSelectedImage(null);
      setPreviewUrl(null);
      setSearched(false);
      setPhotos([]);
  };

  // 定義下載函式 (請放在 Component 內部)
const handleDirectDownload = async (e: React.MouseEvent, photo: any) => {
    // 🛑 1. 阻止事件冒泡 (這是關鍵！防止觸發原本的 "打開大圖" 視窗)
    e.stopPropagation(); 
    e.preventDefault();

    try {
        // 📊 2. 通知後端更新下載次數 (不需等待回應)
        // 請確認環境變數 NEXT_PUBLIC_BACKEND_URL 已設定正確
        const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'https://event-saas-backend-production.up.railway.app';
        fetch(`${backendUrl}/photos/${photo.id}/download`, { method: 'POST' })
            .catch(err => console.error("統計更新失敗", err));

        // 📥 3. 開始下載流程
        // 使用 fetch 抓取圖片資料 (避開瀏覽器直接打開圖片的行為)
        const response = await fetch(photo.url);
        if (!response.ok) throw new Error('Network response was not ok');
        
        const blob = await response.blob(); // 轉成二進制物件
        const blobUrl = window.URL.createObjectURL(blob);
        
        // 建立一個隱藏的下載連結並自動點擊
        const link = document.createElement('a');
        link.href = blobUrl;
        
        // 🧹 清理檔名 (移除 Luma 可能留下的 ID 標記，只留原始檔名)
        // 如果 fileName 包含 '|'，取最後一段；否則使用預設名稱
        const cleanName = photo.fileName && photo.fileName.includes('|') 
            ? photo.fileName.split('|').pop() 
            : (photo.fileName || `photo-${photo.id}.jpg`);
            
        link.download = cleanName; 
        
        document.body.appendChild(link);
        link.click(); // 模擬點擊
        document.body.removeChild(link);
        
        // 清除記憶體
        window.URL.revokeObjectURL(blobUrl);

    } catch (error) {
        console.error("下載失敗:", error);
        // 備案：如果 fetch 失敗 (例如 CORS 問題)，則退回「開新視窗」的方式
        window.open(photo.url, '_blank');
    }
};
  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 font-sans pb-10">
      
      {/* Header / Hero Area */}
      {!searched ? (
          <div className="max-w-7xl mx-auto px-6 py-12 md:py-20 text-center">
            <h1 className="text-4xl md:text-6xl font-extrabold mb-6 tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-400">
                找回您的精彩瞬間
            </h1>
            <p className="text-lg md:text-xl text-slate-400 mb-10 max-w-2xl mx-auto">
                使用 AI 人臉辨識技術，一秒鐘找出所有屬於您的活動照片。
            </p>

            <div className="bg-slate-900/80 backdrop-blur-md p-8 rounded-3xl shadow-2xl border border-slate-800 max-w-md mx-auto">
                <div className="mb-6 relative w-48 h-48 mx-auto rounded-full overflow-hidden border-4 border-slate-700 bg-slate-800 shadow-inner group">
                {previewUrl ? (
                    <img src={previewUrl} alt="Preview" className="w-full h-full object-cover" />
                ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center text-slate-500">
                        <span className="text-4xl mb-2">🤳</span>
                        <span className="text-sm">尚未選擇照片</span>
                    </div>
                )}
                <button onClick={() => fileInputRef.current?.click()} className="absolute inset-0 bg-black/30 flex items-center justify-center opacity-0 hover:opacity-100 transition text-white font-bold">
                    更改
                </button>
                </div>

                <input type="file" ref={fileInputRef} accept="image/*" onChange={handleFileChange} className="hidden" />

                <div className="space-y-3">
                {!selectedImage ? (
                    <button 
                        onClick={() => fileInputRef.current?.click()}
                        className="w-full py-4 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-lg shadow-lg shadow-blue-900/20 transition"
                    >
                        📸 拍攝 / 上傳自拍
                    </button>
                ) : (
                    <button 
                        onClick={handleSearch} 
                        disabled={isSearching}
                        className={`w-full py-4 rounded-xl font-bold text-lg shadow-lg transition flex items-center justify-center gap-2 ${isSearching ? 'bg-slate-700 text-slate-400 cursor-not-allowed' : 'bg-green-600 hover:bg-green-500 text-white shadow-green-900/20'}`}
                    >
                        {isSearching ? '搜尋中...' : '🔍 開始搜尋'}
                    </button>
                )}
                </div>
            </div>
          </div>
      ) : (
          <div className="sticky top-0 z-30 bg-slate-950/80 backdrop-blur-md border-b border-slate-800 px-6 py-4 flex justify-between items-center shadow-lg">
              <h2 className="text-xl font-bold flex items-center gap-2">
                  🎉 找到 {photos.length} 張
              </h2>
              <button 
                  onClick={resetSearch}
                  className="px-4 py-2 bg-slate-800 rounded-lg text-sm text-slate-300 hover:bg-slate-700 transition"
              >
                  🔄 重新搜尋
              </button>
          </div>
      )}

      {/* 搜尋結果列表 */}
      {searched && (
        <div className="max-w-7xl mx-auto px-4 mt-6">
            {photos.length === 0 ? (
                <div className="text-center py-20 bg-slate-900 rounded-2xl border border-slate-800 border-dashed mx-4">
                    <p className="text-slate-400 mb-4">系統找不到與您相似的照片。</p>
                    <button onClick={resetSearch} className="text-blue-400 hover:underline">換一張自拍試試？</button>
                </div>
            ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 pb-20">
                    {photos.map((photo) => (
                        <div 
                            key={photo.id} 
                            className="relative group bg-slate-900 rounded-xl overflow-hidden shadow-lg border border-slate-800"
                        >
                            {/* 🛠️ 關鍵修正：
                                1. aspect-[9/16]: 改為手機長螢幕比例 (9:16)，解決「照片被壓扁/切頭」的問題
                                2. object-contain: 確保整張照片縮放進去，絕對不裁切 (保留紅框)
                            */}
                            <div className="relative w-full aspect-[9/16] bg-slate-900">
                                <img 
                                    src={photo.url} 
                                    className="w-full h-full object-contain" 
                                    loading="lazy" 
                                    alt="Event Photo"
                                />

                                {/* 🛠️ 絕對定位按鈕列 (永遠顯示) */}
                                <div className="absolute bottom-0 left-0 right-0 z-20 flex bg-slate-900/90 backdrop-blur-md border-t border-slate-700">
                                    <button 
                                        onClick={() => downloadPhoto(photo.id, photo.originalUrl || photo.url)}
                                        className="flex-1 py-4 text-white text-sm font-bold hover:bg-slate-800 transition flex items-center justify-center gap-2"
                                    >
                                        ⬇️ 下載
                                    </button>
                                    <div className="w-px bg-slate-700 my-2"></div>
                                    <button 
                                      className="flex-1 py-4 text-blue-400 text-sm font-bold hover:bg-slate-800 transition flex items-center justify-center gap-2"
                                      onClick={() => {
                                          // 1. 🔥 [修正] 先觸發數據追蹤 (不管最後有沒有分享成功，點了就算)
                                          try {
                                              fetch(`${BACKEND_URL}/analytics/track`, {
                                                  method: 'POST',
                                                  headers: { 'Content-Type': 'application/json' },
                                                  body: JSON.stringify({ photoId: photo.id, type: 'SHARE' })
                                              });
                                          } catch (e) { console.error(e); }

                                          // 2. 喚起原生分享選單
                                          if (navigator.share) {
                                              navigator.share({ title: '我的活動照片', url: photo.url }).catch(console.error);
                                          } else {
                                              // 電腦版備案：複製連結
                                              navigator.clipboard.writeText(photo.url);
                                              alert("連結已複製！(這也算一次分享)");
                                          }
                                      }}
                                  >
                                      🔗 分享
                                  </button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
      )}
      
      {/* Footer */}
      {!searched && (
        <footer className="text-center py-8 text-slate-600 text-sm">
            <Link href="/register" className="hover:text-slate-400 transition mx-2">補登記資料</Link> | 
            <Link href="/photographer" className="hover:text-slate-400 transition mx-2">攝影師登入</Link>
        </footer>
      )}
    </main>
  );
}