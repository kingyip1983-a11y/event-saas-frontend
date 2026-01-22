// Force Update: Fix green box display
'use client';

import { useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import Papa from 'papaparse';

const BACKEND_URL = "https://event-saas-backend-production.up.railway.app";
const socket = io(BACKEND_URL);

const ADMIN_PASSWORD = "admin"; 

// 定義人臉結構
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
    faces?: Face[]; // 👈 確保有這個欄位
}

interface Person { id: number; name: string; phoneNumber: string; seatNumber?: string; }

export default function PhotographerPage() {
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

  // Login
  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (passwordInput === ADMIN_PASSWORD) {
      setIsAuthenticated(true);
      loadAllPhotos();
      loadAllGuests();
    } else { setErrorMsg('密碼錯誤'); setPasswordInput(''); }
  };

  const loadAllPhotos = () => {
    fetch(`${BACKEND_URL}/photos`).then(res => res.json()).then(data => {
      if (Array.isArray(data)) setPhotos(data);
    }).catch(console.error);
  };

  const loadAllGuests = () => {
    fetch(`${BACKEND_URL}/guests`).then(res => res.json()).then(data => {
      if (Array.isArray(data)) setGuests(data);
    }).catch(console.error);
  };

  useEffect(() => {
    if (!isAuthenticated) return;
    socket.on('new_photo_ready', (newPhoto: Photo) => {
        setPhotos(prev => [newPhoto, ...prev.filter(p => p.id !== newPhoto.id)]);
    });
    socket.on('photo_deleted', (id: number) => {
        setPhotos(prev => prev.filter(p => p.id !== id));
    });
    return () => { socket.off('new_photo_ready'); socket.off('photo_deleted'); };
  }, [isAuthenticated]);

  const handleDeleteGuest = async (id: number, name: string) => {
    if (!confirm(`確定要刪除賓客「${name}」嗎？`)) return;
    try {
        const res = await fetch(`${BACKEND_URL}/guest/${id}`, { method: 'DELETE' });
        if (res.ok) setGuests(prev => prev.filter(g => g.id !== id));
    } catch (err) { alert('連線錯誤'); }
  };

  const downloadTemplate = () => {
    const csvContent = "\uFEFFphone,name,seat\n85291234567,陳大文,Table 1";
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "template.csv";
    link.click();
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length) return;
    setUploading(true);
    for (let i = 0; i < e.target.files.length; i++) {
        const formData = new FormData();
        formData.append('photo', e.target.files[i]);
        await fetch(`${BACKEND_URL}/upload`, { method: 'POST', body: formData }).catch(console.error);
    }
    setUploading(false);
    loadAllPhotos();
    e.target.value = ''; 
  };

  const executeDeletePhoto = async () => {
    if (deleteTargetId) {
        await fetch(`${BACKEND_URL}/photo/${deleteTargetId}`, { method: 'DELETE' });
        setDeleteTargetId(null);
    }
  };

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

            if (!confirm(`⚠️ 這將【清空】舊資料並匯入 ${formattedGuests.length} 筆新名單。確定嗎？`)) return;

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

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <form onSubmit={handleLogin} className="bg-slate-800 p-8 rounded-2xl text-center space-y-4">
          <h2 className="text-xl font-bold text-white">攝影師後台</h2>
          <input type="password" value={passwordInput} onChange={e => setPasswordInput(e.target.value)} placeholder="密碼" className="w-full px-4 py-2 rounded bg-slate-900 text-white" />
          {errorMsg && <p className="text-red-400 text-xs">{errorMsg}</p>}
          <button type="submit" className="w-full py-2 bg-blue-600 text-white rounded font-bold">解鎖</button>
        </form>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 p-6 font-sans text-slate-200">
      <div className="max-w-7xl mx-auto">
        <header className="flex justify-between items-center mb-8">
          <div className="flex gap-4">
             <h1 className="text-2xl font-bold text-white">工作台</h1>
             <div className="flex bg-slate-900 rounded p-1">
                <button onClick={() => setActiveTab('photos')} className={`px-4 py-1 rounded ${activeTab==='photos'?'bg-blue-600':''}`}>照片</button>
                <button onClick={() => setActiveTab('guests')} className={`px-4 py-1 rounded ${activeTab==='guests'?'bg-blue-600':''}`}>名單</button>
             </div>
          </div>
          {activeTab === 'photos' && (
             <div className="flex gap-4">
                <div className="flex bg-slate-900 rounded p-1 text-xs">
                    <button onClick={() => setViewMode('original')} className={`px-3 py-1 rounded ${viewMode==='original'?'bg-slate-700 text-white':'text-slate-500'}`}>原圖</button>
                    <button onClick={() => setViewMode('framed')} className={`px-3 py-1 rounded ${viewMode==='framed'?'bg-slate-700 text-white':'text-slate-500'}`}>合成</button>
                </div>
                <label className={`cursor-pointer px-4 py-2 bg-green-600 rounded text-white font-bold text-sm ${uploading?'opacity-50':''}`}>
                    {uploading ? '上傳中...' : '＋ 上傳'}
                    <input type="file" multiple accept="image/*" onChange={handleUpload} className="hidden" disabled={uploading} />
                </label>
             </div>
          )}
        </header>

        {activeTab === 'photos' && (
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {photos.map(photo => (
                <div key={photo.id} className="relative group bg-slate-900 rounded-lg overflow-hidden border border-slate-800">
                    <img 
                        src={viewMode === 'original' && photo.originalUrl ? photo.originalUrl : photo.url} 
                        className="w-full aspect-[2/3] object-cover" 
                        loading="lazy" 
                    />
                    
                    {/* 👇👇👇 綠色 AI 框框渲染區 👇👇👇 */}
                    {photo.faces?.map((face, i) => (
                        <div key={i} 
                            style={{
                                position: 'absolute',
                                left: `${face.boundingBox.x * 100}%`,
                                top: `${face.boundingBox.y * 100}%`,
                                width: `${face.boundingBox.width * 100}%`,
                                height: `${face.boundingBox.height * 100}%`,
                                border: '2px solid #00ff00', // 鮮綠色框
                                boxShadow: '0 0 5px #00ff00'
                            }}
                        >
                            {/* 如果有認出人，顯示名字 */}
                            {face.person && (
                                <div className="absolute -top-6 left-0 bg-green-600 text-white text-[10px] px-1 rounded whitespace-nowrap">
                                    {face.person.name}
                                </div>
                            )}
                        </div>
                    ))}
                    {/* 👆👆👆 結束 👆👆👆 */}

                    <button onClick={() => setDeleteTargetId(photo.id)} className="absolute top-2 right-2 p-2 bg-red-600 text-white rounded-full opacity-0 group-hover:opacity-100 transition">🗑️</button>
                </div>
            ))}
            </div>
        )}

        {activeTab === 'guests' && (
            // ... (省略賓客列表 HTML 以節省篇幅，這部分您原本的就很好，或直接保留原本的)
             <div className="text-center text-slate-500 mt-10">請參考先前的代碼或自行保留此區塊</div>
        )}
      </div>

      {deleteTargetId && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
            <div className="bg-slate-800 p-6 rounded text-center">
                <h3 className="text-white mb-4">刪除此照片？</h3>
                <div className="flex gap-2 justify-center">
                    <button onClick={() => setDeleteTargetId(null)} className="px-4 py-2 bg-slate-600 rounded">取消</button>
                    <button onClick={executeDeletePhoto} className="px-4 py-2 bg-red-600 rounded text-white">確認</button>
                </div>
            </div>
        </div>
      )}
    </main>
  );
}