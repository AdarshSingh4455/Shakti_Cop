import React, { useEffect, useState } from 'react';
import { api } from '../lib/api';

export default function Services() {
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;

    async function loadServices() {
      try {
        const data = await api('/police-services', { auth: false });

        if (active) {
          setGroups(Array.isArray(data) ? data : []);
        }
      } catch (err) {
        if (active) {
          setError(err.message || 'Police services load नहीं हो सकीं');
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    loadServices();

    return () => {
      active = false;
    };
  }, []);

  return (
    <div>
      <div className="page-head">
        <h1>पुलिस सेवाएं</h1>
      </div>

      {loading && (
        <div className="card empty">
          पुलिस सेवाएं लोड हो रही हैं...
        </div>
      )}

      {error && (
        <div className="card empty">
          <strong>डेटा लोड नहीं हो सका</strong>
          <div>{error}</div>
        </div>
      )}

      {!loading && !error && groups.length === 0 && (
        <div className="card empty">
          अभी कोई पुलिस सेवा उपलब्ध नहीं है।
        </div>
      )}

      {!loading && !error && groups.map((group, index) => (
        <section className="card" key={`${group.group || 'group'}-${index}`}>
          <h2>{group.group}</h2>

          <div>
            {(group.items || []).map((item) => (
              <div
                key={item.id}
                style={{
                  padding: '16px 0',
                  borderBottom: '1px solid #e5e7eb',
                }}
              >
                <div style={{ fontWeight: 700, fontSize: '18px' }}>
                  {item.title}
                </div>

                {item.tag && (
                  <div style={{ marginTop: '5px', color: '#64748b' }}>
                    {item.tag}
                  </div>
                )}

                {item.desc && (
                  <div style={{ marginTop: '8px', color: '#475569' }}>
                    {item.desc}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}