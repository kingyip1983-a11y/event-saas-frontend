// limited photo upload + Masonry Fix + Connection Fix
'use client';

import { useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import Papa from 'papaparse';
import imageCompression from 'browser-image-compression';

// 🔌 修正：同時支援兩種變數名稱，並保留 Production 作為最後防線
const BACKEND_URL = 
  process.env.NEXT_PUBLIC_BACKEND_URL || 
  process.env.NEXT_PUBLIC_API_URL || 
  "https://event-saas-backend-production.up.railway.app";

const socket = io(BACKEND_URL);

// 可以自訂管理員密碼，或是預設 admin
const ADMIN_PASSWORD = process.env.NEXT_PUBLIC_ADMIN_PASSWORD || "admin"; 

// --- 型別定義 ---
interface Face { 
    id: number; 
    boundingBox: { x: number; y: number; width: number; height: number }; 
    person?: { name: string; } 
}

interface Photo { 
    id: number; 
    url: string; 
    originalUrl?: string; 
    status: string; 
    faces?: Face[]; 
}

interface Person { 
    id: number; 
    name: string; 
    phoneNumber: string; 
    seatNumber?: string; 
}

export default function PhotographerPage() {
  // 狀態管理
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const [activeTab, setActiveTab] = useState<'photos' | 'guests'>('photos');
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [guests, setGuests] = useState<Person[]>([]);
  
  const [uploading, setUploading] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<'framed' | 'original'>('framed');

  const [newGuest, setNewGuest] = useState({ name: '', phone: '', seat: '' });

  // 🔐 登入處理
  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (passwordInput === ADMIN_PASSWORD) {
      setIsAuthenticated(true);
      loadAllPhotos();
      loadAllGuests();
    } else { 
      setErrorMsg('密碼錯誤'); 
      setPasswordInput(''); 
    }
  };

  // 📡 載入資料函式
  const loadAllPhotos = () => {
    fetch(`${BACKEND_URL}/photos`)
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) setPhotos(data);
      })
      .catch(console.error);
  };

  const loadAllGuests = () => {
    fetch(`${BACKEND_URL}/guests`)
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) setGuests(data);
      })
      .catch(console.error);
  };

  // 🔌 Socket 連線監聽
  useEffect(() => {
    if (!isAuthenticated) return;

    // 監聽新照片
    socket.on('new_photo_ready', (newPhoto: Photo) => {
        setPhotos(prev => [newPhoto, ...prev.filter(p => p.id !== newPhoto.id)]);
    });

    // 監聽刪除照片
    socket.on('photo_deleted', (id: number) => {
        setPhotos(prev => prev.filter(p => p.id !== id));
    });

    return () => { 
        socket.off('new_photo_ready'); 
        socket.off('photo_deleted'); 
    };
  }, [isAuthenticated]);

  // 🗑️ 刪除照片
  const executeDeletePhoto = async () => {
    if (!deleteTargetId) return;
    try {
        const res = await fetch(`${BACKEND_URL}/photo/${deleteTargetId}`, { method: 'DELETE' });
        if (res.ok) {
            setDeleteTargetId(null);
            // Socket 會處理畫面更新
        } else {
            alert("刪除失敗");
        }
    } catch (err) { 
        alert('連線錯誤'); 
    }
  };

  // 🗑️ 刪除賓客
  const handleDeleteGuest = async (id: number, name: string) => {
    if (!confirm(`確定要刪除賓客「${name}」嗎？`)) return;
    try {
        const res = await fetch(`${BACKEND_URL}/guest/${id}`, { method: 'DELETE' });
        if (res.ok) setGuests(prev => prev.filter(g => g.id !== id));
    } catch (err) { alert('連線錯誤'); }
  };

  // 📥 下載 CSV 範本
  const downloadTemplate = () => {
    const csvContent = "\uFEFFphone,name,seat\n85291234567,陳大文,Table 1";
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "template.csv";
    link.click();
  };

  // 📸 處理上傳 (前端壓縮版)
  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length) return;
    setUploading(true);

    const options = {
      maxSizeMB: 1,              
      maxWidthOrHeight: 2048,    
      useWebWorker: true,        
      initialQuality: 0.8,       
    };

    for (let i = 0; i < e.target.files.length; i++) {
        const originalFile = e.target.files[i];
        
        try {
            console.log(`[${originalFile.name}] 壓縮前: ${(originalFile.size / 1024 / 1024).toFixed(2)} MB`);
            const compressedFile = await imageCompression(originalFile, options);
            console.log(`[${originalFile.name}] 壓縮後: ${(compressedFile.size / 1024 / 1024).toFixed(2)} MB`);

            const finalFile = new File([compressedFile], originalFile.name, {
                type: compressedFile.type,
                lastModified: Date.now(),
            });

            const formData = new FormData();
            formData.append('photo', finalFile);
            await fetch(`${BACKEND_URL}/upload`, { method: 'POST', body: formData });

        } catch (error) {
            console.error("壓縮失敗，嘗試上傳原圖:", error);
            const formData = new FormData();
            formData.append('photo', originalFile);
            await fetch(`${BACKEND_URL}/upload`, { method: 'POST', body: formData });
        }
    }
    
    setUploading(false);
    loadAllPhotos(); // ✅ 確保重新整理照片列表
    e.target.value = ''; 
  };

  // ➕ 新增單一賓客
  const handleAddGuest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGuest.phone) return alert("電話是必填的");
    try {
        await fetch(`${BACKEND_URL}/upsert-guest`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: newGuest.name, phone: newGuest.phone, seatNumber: newGuest.seat })
        });
        setNewGuest({ name: '', phone: '', seat: '' });
        loadAllGuests(); 
    } catch (err) { alert("連線錯誤"); }
  };

  // 📤 CSV 批量上傳 (保留舊資料模式)
  const handleCSVUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    Papa.parse(file, {
        header: true, skipEmptyLines: true,
        complete: async (results) => {
            const parsedData = results.data;
            if (parsedData.length === 0) return alert("CSV 是空的！");
            const formattedGuests = parsedData.map((row: any) => ({
                name: row.name || row.Name || row.姓名 || '',
                phone: row.phone || row.Phone || row.電話 || '',
                seatNumber: row.seat || row.Seat || row.座位 || ''
            })).filter((g: any) => g.phone); 

            // ⚠️ 這裡的邏輯已經是後端 "Upsert" (不刪舊資料)，所以提示文字可以稍微溫和一點
            if (!confirm(`⚠️ 即將匯入 ${formattedGuests.length} 筆名單 (會更新相同電話的資料)。確定嗎？`)) return;

            try {
                const res = await fetch(`${BACKEND_URL}/upsert-guests-bulk`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ guests: formattedGuests })
                });
                if (res.ok) { alert(`🎉 成功匯入！`); loadAllGuests(); }
            } catch (err) { alert(`上傳失敗`); }
            e.target.value = ''; 
        }
    });
  };

  // --- 渲染畫面 ---

  // 未登入畫面
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <form onSubmit={handleLogin} className="bg-slate-800 p-8 rounded-2xl text-center space-y-4 border border-slate-700 shadow-2xl">
          <h2 className="text-xl font-bold text-white">攝影師後台</h2>
          <input 
            type="password" 
            value={passwordInput} 
            onChange={e => setPasswordInput(e.target.value)} 
            placeholder="請輸入密碼" 
            className="w-full px-4 py-2 rounded bg-slate-900 text-white border border-slate-600 focus:border-blue-500 outline-none" 
          />
          {errorMsg && <p className="text-red-400 text-xs">{errorMsg}</p>}
          <button type="submit" className="w-full py-2 bg-blue-600 hover:bg-blue-500 text-white rounded font-bold transition">解鎖</button>
        </form>
      </div>
    );
  }

  // 主畫面
  return (
    <main className="min-h-screen bg-slate-950 p-6 font-sans text-slate-200">
      <div className="max-w-7xl mx-auto">
        
        {/* Header */}
        <header className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4 sticky top-0 z-30 bg-slate-950/80 backdrop-blur-md py-4 -mx-6 px-6 border-b border-slate-800/50">
          
          <div className="flex w-full md:w-auto justify-between md:justify-start items-center gap-4">
             <h1 className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-400 shrink-0">工作台</h1>
             
             <div className="flex bg-slate-900 rounded-lg p-1 shrink-0 border border-slate-800">
                <button 
                    onClick={() => setActiveTab('photos')} 
                    className={`px-4 py-1.5 text-sm rounded-md transition font-medium ${activeTab==='photos'?'bg-blue-600 text-white shadow-lg':'text-slate-400 hover:text-white'}`}
                >
                    照片
                </button>
                <button 
                    onClick={() => setActiveTab('guests')} 
                    className={`px-4 py-1.5 text-sm rounded-md transition font-medium ${activeTab==='guests'?'bg-blue-600 text-white shadow-lg':'text-slate-400 hover:text-white'}`}
                >
                    名單
                </button>
             </div>
          </div>

          {activeTab === 'photos' && (
             <div className="flex w-full md:w-auto justify-between md:justify-end gap-3 items-center">
                
                <div className="flex bg-slate-900 rounded-lg p-1 text-xs shrink-0 border border-slate-800">
                    <button 
                        onClick={() => setViewMode('original')} 
                        className={`px-3 py-2 rounded-md transition ${viewMode==='original'?'bg-slate-700 text-white':'text-slate-500 hover:text-slate-300'}`}
                    >
                        原圖
                    </button>
                    <button 
                        onClick={() => setViewMode('framed')} 
                        className={`px-3 py-2 rounded-md transition ${viewMode==='framed'?'bg-slate-700 text-white':'text-slate-500 hover:text-slate-300'}`}
                    >
                        合成
                    </button>
                </div>

                <label className={`cursor-pointer flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-green-600 to-green-500 rounded-lg text-white font-bold text-sm hover:from-green-500 hover:to-green-400 transition shadow-lg transform active:scale-95 ${uploading?'opacity-50 cursor-not-allowed':''}`}>
                    {uploading ? (
                        <>
                           <svg className="animate-spin h-4 w-4 text-white" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg>
                           <span>處理中...</span>
                        </>
                    ) : (
                        <>
                           <span className="text-lg">＋</span> <span>上傳照片</span>
                        </>
                    )}
                    <input type="file" multiple accept="image/*" onChange={handleUpload} className="hidden" disabled={uploading} />
                </label>
             </div>
          )}
        </header>

        {/* 📸 照片列表 (Masonry 瀑布流 Fix) */}
        {activeTab === 'photos' && (
            <div className="columns-2 md:columns-3 lg:columns-4 gap-4 space-y-4 px-1 pb-20">
            {photos.map(photo => (
                <div key={photo.id} className="break-inside-avoid relative group bg-slate-900 rounded-xl overflow-hidden shadow-lg border border-slate-800 mb-4 transition hover:shadow-2xl">
                    
                    <div className="relative w-full"> 
                        <img 
                            src={viewMode === 'original' && photo.originalUrl ? photo.originalUrl : photo.url} 
                            className="w-full h-auto block" 
                            loading="lazy" 
                            alt={`Photo ${photo.id}`}
                        />
                        
                        {/* 🟢 AI 辨識框 (Green Box) */}
                        {photo.faces?.map((face, i) => (
                            <div key={i} 
                                style={{
                                    position: 'absolute',
                                    left: `${face.boundingBox.x * 100}%`,
                                    top: `${face.boundingBox.y * 100}%`,
                                    width: `${face.boundingBox.width * 100}%`,
                                    height: `${face.boundingBox.height * 100}%`,
                                    border: '2px solid #22c55e', // Tailwind green-500
                                    boxShadow: '0 0 8px rgba(34, 197, 94, 0.5)'
                                }}
                            >
                                {face.person && (
                                    <div className="absolute -top-7 left-1/2 -translate-x-1/2 bg-green-600 text-white text-[10px] px-2 py-0.5 rounded-full whitespace-nowrap z-10 shadow-sm border border-green-400">
                                        {face.person.name}
                                    </div>
                                )}
                            </div>
                        ))}

                        {/* 刪除按鈕 (Hover 顯示) */}
                        <button 
                            onClick={(e) => { e.stopPropagation(); setDeleteTargetId(photo.id); }} 
                            className="absolute top-2 right-2 p-2 bg-red-600/80 hover:bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition backdrop-blur-sm shadow-md"
                            title="刪除此照片"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                        </button>
                    </div> 

                </div>
            ))}
            {photos.length === 0 && (
                <div className="col-span-full py-20 text-center text-slate-500">
                    📷 尚無照片，請點擊右上角「上傳照片」
                </div>
            )}
            </div>
        )}

        {/* 📋 名單管理 (保持原樣) */}
        {activeTab === 'guests' && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 pb-20">
                <div className="md:col-span-1 space-y-6">
                    {/* CSV 上傳區 */}
                    <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl relative group shadow-lg">
                        <button onClick={downloadTemplate} className="absolute top-4 right-4 text-xs bg-slate-700 hover:bg-slate-600 px-3 py-1.5 rounded-full text-slate-300 transition">📥 下載範本</button>
                        <h3 className="text-lg font-bold text-white mb-2">CSV 匯入</h3>
                        <p className="text-xs text-slate-400 mb-4">支援 Excel 轉出的 .csv 檔案</p>
                        <label className="flex flex-col items-center justify-center w-full p-6 border-2 border-dashed border-slate-700 rounded-xl cursor-pointer hover:bg-slate-800/50 hover:border-blue-500 transition group">
                            <span className="text-3xl mb-2">📁</span>
                            <span className="text-sm font-bold text-blue-400 group-hover:text-blue-300">點擊上傳 CSV</span>
                            <input type="file" accept=".csv" onChange={handleCSVUpload} className="hidden" />
                        </label>
                    </div>

                    {/* 單筆新增 */}
                    <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl sticky top-24 shadow-lg">
                        <h3 className="text-lg font-bold text-white mb-4">＋ 單筆新增</h3>
                        <form onSubmit={handleAddGuest} className="space-y-4">
                            <div><label className="text-xs text-slate-500 uppercase font-bold mb-1 block">電話 <span className="text-red-500">*</span></label><input type="text" value={newGuest.phone} onChange={e => setNewGuest({...newGuest, phone: e.target.value})} placeholder="91234567" className="w-full p-3 rounded-lg bg-slate-800 border border-slate-700 text-white focus:outline-none focus:border-blue-500 transition"/></div>
                            <div><label className="text-xs text-slate-500 uppercase font-bold mb-1 block">姓名</label><input type="text" value={newGuest.name} onChange={e => setNewGuest({...newGuest, name: e.target.value})} placeholder="陳大文" className="w-full p-3 rounded-lg bg-slate-800 border border-slate-700 text-white focus:outline-none focus:border-blue-500 transition"/></div>
                            <div><label className="text-xs text-slate-500 uppercase font-bold mb-1 block text-yellow-500">座位號</label><input type="text" value={newGuest.seat} onChange={e => setNewGuest({...newGuest, seat: e.target.value})} placeholder="Table 5" className="w-full p-3 rounded-lg bg-slate-800 border border-slate-700 text-white focus:outline-none focus:border-yellow-500 transition"/></div>
                            <button type="submit" className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl transition shadow-lg mt-2">儲存名單</button>
                        </form>
                    </div>
                </div>

                {/* 名單列表 */}
                <div className="md:col-span-2">
                     <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
                        <div className="p-4 bg-slate-800/50 border-b border-slate-800 flex justify-between items-center backdrop-blur-sm">
                            <span className="text-slate-400 text-sm font-bold">已匯入名單 ({guests.length} 人)</span>
                            <button onClick={loadAllGuests} className="text-xs px-3 py-1 bg-slate-800 hover:bg-slate-700 rounded-full text-blue-400 transition">↻ 刷新</button>
                        </div>
                        <div className="max-h-[75vh] overflow-y-auto custom-scrollbar">
                            <table className="w-full text-left border-collapse">
                                <thead className="bg-slate-900/90 text-slate-400 text-xs uppercase sticky top-0 z-10 backdrop-blur-md shadow-sm">
                                    <tr>
                                        <th className="p-4 font-semibold tracking-wider">姓名</th>
                                        <th className="p-4 font-semibold tracking-wider">電話</th>
                                        <th className="p-4 font-semibold tracking-wider">座位</th>
                                        <th className="p-4 text-right">操作</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-800">
                                    {guests.map(g => (
                                        <tr key={g.id} className="hover:bg-slate-800/40 transition group">
                                            <td className="p-4 font-bold text-white">{g.name || <span className="text-slate-600 italic">未知</span>}</td>
                                            <td className="p-4 text-slate-400 font-mono tracking-wide">{g.phoneNumber}</td>
                                            <td className="p-4"><span className="px-2 py-1 bg-yellow-500/10 text-yellow-500 rounded text-xs font-bold border border-yellow-500/20">{g.seatNumber || '-'}</span></td>
                                            <td className="p-4 text-right">
                                                <button onClick={() => handleDeleteGuest(g.id, g.name || g.phoneNumber)} className="text-slate-600 hover:text-red-500 hover:bg-red-500/10 p-2 rounded transition" title="刪除">
                                                    🗑️
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                    {guests.length === 0 && <tr><td colSpan={4} className="p-16 text-center text-slate-500 italic">尚無資料，請從左側新增</td></tr>}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        )}
      </div>

      {/* 刪除確認彈窗 */}
      {deleteTargetId && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-slate-800 p-8 rounded-2xl text-center border border-slate-700 shadow-2xl max-w-sm w-full transform transition-all scale-100">
                <div className="w-16 h-16 bg-red-500/10 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4 text-3xl">🗑️</div>
                <h3 className="text-white mb-2 text-xl font-bold">確定刪除此照片？</h3>
                <p className="text-slate-400 text-sm mb-6">此動作無法復原，相關的 AI 數據也會一併移除。</p>
                <div className="flex gap-3 justify-center">
                    <button onClick={() => setDeleteTargetId(null)} className="flex-1 px-4 py-3 bg-slate-700 rounded-xl text-white hover:bg-slate-600 font-bold transition">取消</button>
                    <button onClick={executeDeletePhoto} className="flex-1 px-4 py-3 bg-red-600 rounded-xl text-white hover:bg-red-500 font-bold transition shadow-lg shadow-red-900/20">確認刪除</button>
                </div>
            </div>
        </div>
      )}
    </main>
  );
}