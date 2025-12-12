import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';

const Tooltip = ({ children, content, position = 'top' }) => {
    const [visible, setVisible] = useState(false);
    const [coords, setCoords] = useState({ top: 0, left: 0 });
    const triggerRef = useRef(null);

    const updatePosition = () => {
        if (triggerRef.current) {
            const rect = triggerRef.current.getBoundingClientRect();
            let top, left, transform;

            if (position === 'bottom') {
                top = rect.bottom + 8;
                left = rect.left + (rect.width / 2);
                transform = 'translate(-50%, 0)';
            } else {
                // Default 'top'
                top = rect.top - 8;
                left = rect.left + (rect.width / 2);
                transform = 'translate(-50%, -100%)';
            }

            setCoords({ top, left, transform });
        }
    };

    const handleMouseEnter = () => {
        updatePosition();
        setVisible(true);
    };

    const handleMouseLeave = () => {
        setVisible(false);
    };

    // Update position on scroll/resize just in case
    useEffect(() => {
        if (visible) {
            window.addEventListener('scroll', updatePosition);
            window.addEventListener('resize', updatePosition);
            return () => {
                window.removeEventListener('scroll', updatePosition);
                window.removeEventListener('resize', updatePosition);
            };
        }
    }, [visible]);

    return (
        <>
            <div
                ref={triggerRef}
                className="relative flex"
                onMouseEnter={handleMouseEnter}
                onMouseLeave={handleMouseLeave}
            >
                {children}
            </div>

            {visible && createPortal(
                <div
                    className="fixed px-3 py-1.5 bg-[#1a1a20] text-slate-200 text-[11px] font-medium rounded-lg whitespace-nowrap z-[9999] pointer-events-none border border-white/10 shadow-xl animate-in fade-in duration-200"
                    style={{
                        top: coords.top,
                        left: coords.left,
                        transform: coords.transform
                    }}
                >
                    {content}
                    {position === 'top' && <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-[#1a1a20]" />}
                    {position === 'bottom' && <div className="absolute bottom-full left-1/2 -translate-x-1/2 border-4 border-transparent border-b-[#1a1a20]" />}
                </div>,
                document.body
            )}
        </>
    );
};

export default Tooltip;
