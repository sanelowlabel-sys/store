import React from 'react';
import { CheckCircle2, Info, AlertCircle, X } from 'lucide-react';
import { ToastNotification } from '../types';

interface ToastContainerProps {
  toasts: ToastNotification[];
  onDismiss: (id: string) => void;
}

export const ToastContainer: React.FC<ToastContainerProps> = ({ toasts, onDismiss }) => {
  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2 max-w-sm pointer-events-none">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className="pointer-events-auto flex items-center gap-3 p-3.5 rounded-2xl bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900 shadow-2xl border border-stone-800 dark:border-stone-200 animate-in slide-in-from-bottom-5 fade-in duration-200"
        >
          {toast.image ? (
            <img src={toast.image} alt="" className="w-10 h-10 object-cover rounded-lg flex-shrink-0" />
          ) : toast.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0" />
          ) : toast.type === 'error' ? (
            <AlertCircle className="w-5 h-5 text-rose-400 flex-shrink-0" />
          ) : (
            <Info className="w-5 h-5 text-red-500 flex-shrink-0" />
          )}

          <div className="flex-1 min-w-0 text-xs">
            <h5 className="font-bold">{toast.title}</h5>
            <p className="text-[11px] opacity-80 truncate">{toast.message}</p>
          </div>

          <button
            onClick={() => onDismiss(toast.id)}
            className="text-stone-400 hover:text-white dark:hover:text-stone-900 p-1"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
};
