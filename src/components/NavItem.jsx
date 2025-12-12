import React from 'react';

const NavItem = ({ active, onClick, icon, label, badge }) => (
    <button onClick={onClick} className={`nav-item w-full group ${active ? 'active' : ''}`}>
        <span className={`transition-colors duration-200 ${active ? 'text-violet-400' : 'text-slate-500 group-hover:text-slate-300'}`}>{icon}</span>
        <span className="hidden lg:block text-left flex-1 font-medium tracking-wide">{label}</span>
        {badge > 0 && <span className="hidden lg:flex bg-violet-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-md min-w-[20px] justify-center shadow-lg shadow-violet-600/20">{badge}</span>}
    </button>
);

export default NavItem;
