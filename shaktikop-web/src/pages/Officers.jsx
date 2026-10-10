import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';

function valueOf(row, ...keys) {
  for (const key of keys) {
    const value = row?.[key];
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      return value;
    }
  }
  return '—';
}

export default function Officers() {
  const { admin } = useAuth();
  const isSuperAdmin = admin?.adminRole === 'super_admin';
  const isDistrictAdmin = admin?.adminRole === 'district_admin';
  const isMonitor = admin?.adminRole === 'monitor';
  const canManageOfficers = isSuperAdmin || isDistrictAdmin;

  // Active view tab: 'officers' or 'district_admins' (Super Admin only)
  const [activeTab, setActiveTab] = useState('officers');

  // Master data: locations
  const [locationData, setLocationData] = useState({ districts: [], stationsByDistrict: {} });

  // Officer list state
  const [officers, setOfficers] = useState([]);
  const [officersLoading, setOfficersLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterDistrict, setFilterDistrict] = useState(isDistrictAdmin ? (admin?.district || '') : '');
  const [filterStation, setFilterStation] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');

  // Admin list state (Super Admin only)
  const [adminsList, setAdminsList] = useState([]);
  const [adminsLoading, setAdminsLoading] = useState(false);

  // Global alert messages
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Modals state
  const [showAddOfficerModal, setShowAddOfficerModal] = useState(false);
  const [editingOfficer, setEditingOfficer] = useState(null);
  const [deletingOfficer, setDeletingOfficer] = useState(null);

  const [showAddAdminModal, setShowAddAdminModal] = useState(false);
  const [editingAdmin, setEditingAdmin] = useState(null);

  // Modal form states
  const [officerForm, setOfficerForm] = useState({
    name: '',
    badgeId: '',
    mobile: '',
    email: '',
    password: '',
    rank: 'SI',
    designation: '',
    district: isDistrictAdmin ? (admin?.district || '') : '',
    station: '',
  });

  const [adminForm, setAdminForm] = useState({
    name: '',
    username: '',
    mobile: '',
    email: '',
    password: '',
    district: '',
  });

  const [modalBusy, setModalBusy] = useState(false);
  const [modalError, setModalError] = useState('');

  // 1. Load Location Data once
  useEffect(() => {
    let mounted = true;
    async function fetchLocations() {
      try {
        const res = await api('/content/location-data', { auth: false });
        if (mounted && res) {
          setLocationData({
            districts: Array.isArray(res.districts) ? res.districts : [],
            stationsByDistrict: res.stationsByDistrict || {},
          });
        }
      } catch (e) {
        // Fallback: Location data optional if backend endpoint differs
      }
    }
    fetchLocations();
    return () => { mounted = false; };
  }, []);

  // 2. Fetch Officers
  const loadOfficers = useCallback(async () => {
    setOfficersLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.append('search', search.trim());
      if (filterStatus && filterStatus !== 'all') params.append('status', filterStatus);

      // District scoping
      if (isDistrictAdmin && admin?.district) {
        params.append('district', admin.district);
      } else if (isSuperAdmin && filterDistrict) {
        params.append('district', filterDistrict);
      }

      if (filterStation) {
        params.append('station', filterStation);
      }

      const queryStr = params.toString() ? `?${params.toString()}` : '';
      const data = await api(`/admin/officers${queryStr}`);

      if (Array.isArray(data)) {
        setOfficers(data);
      } else if (Array.isArray(data?.officers)) {
        setOfficers(data.officers);
      } else {
        setOfficers([]);
      }
    } catch (err) {
      setError(err?.message || 'अधिकारी सूची लोड नहीं हो सकी।');
    } finally {
      setOfficersLoading(false);
    }
  }, [search, filterStatus, filterDistrict, filterStation, isDistrictAdmin, isSuperAdmin, admin?.district]);

  // 3. Fetch District Admins (Super Admin only)
  const loadAdmins = useCallback(async () => {
    if (!isSuperAdmin) return;
    setAdminsLoading(true);
    setError('');
    try {
      const data = await api('/admin/admins');
      setAdminsList(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err?.message || 'व्यवस्थापक सूची लोड नहीं हो सकी।');
    } finally {
      setAdminsLoading(false);
    }
  }, [isSuperAdmin]);

  useEffect(() => {
    if (activeTab === 'officers') {
      loadOfficers();
    } else if (activeTab === 'district_admins' && isSuperAdmin) {
      loadAdmins();
    }
  }, [activeTab, loadOfficers, loadAdmins, isSuperAdmin]);

  // Auto-clear messages
  const notifySuccess = (msg) => {
    setSuccess(msg);
    setTimeout(() => setSuccess(''), 6000);
  };

  // Available station options based on selected district in Officer Form
  const formStationOptions = useMemo(() => {
    const dist = isDistrictAdmin ? admin?.district : officerForm.district;
    if (!dist) return [];
    return locationData.stationsByDistrict[dist] || [];
  }, [isDistrictAdmin, admin?.district, officerForm.district, locationData.stationsByDistrict]);

  // Available station options for filter
  const filterStationOptions = useMemo(() => {
    const dist = isDistrictAdmin ? admin?.district : filterDistrict;
    if (!dist) return [];
    return locationData.stationsByDistrict[dist] || [];
  }, [isDistrictAdmin, admin?.district, filterDistrict, locationData.stationsByDistrict]);

  // Handle Add Officer
  const openAddOfficer = () => {
    const initialDistrict = isDistrictAdmin ? (admin?.district || '') : (locationData.districts[0] || '');
    const stations = locationData.stationsByDistrict[initialDistrict] || [];
    setOfficerForm({
      name: '',
      badgeId: '',
      mobile: '',
      email: '',
      password: '',
      rank: 'SI',
      designation: '',
      district: initialDistrict,
      station: stations[0] || '',
    });
    setModalError('');
    setShowAddOfficerModal(true);
  };

  const handleCreateOfficer = async (e) => {
    e.preventDefault();
    setModalBusy(true);
    setModalError('');
    try {
      const payload = {
        name: officerForm.name.trim(),
        badgeId: officerForm.badgeId.trim(),
        mobile: officerForm.mobile.trim(),
        email: officerForm.email.trim() || undefined,
        password: officerForm.password,
        rank: officerForm.rank,
        designation: officerForm.designation.trim() || undefined,
        district: isDistrictAdmin ? admin.district : officerForm.district.trim(),
        station: officerForm.station ? officerForm.station.trim() : undefined,
      };

      await api('/admin/officers', { method: 'POST', body: payload });
      setShowAddOfficerModal(false);
      notifySuccess(`अधिकारी ${payload.name} सफलतापूर्वक जोड़ा गया।`);
      loadOfficers();
    } catch (err) {
      setModalError(err.message || 'अधिकारी जोड़ने में त्रुटि।');
    } finally {
      setModalBusy(false);
    }
  };

  // Handle Edit Officer
  const openEditOfficer = (off) => {
    setEditingOfficer(off);
    setOfficerForm({
      name: off.name || '',
      badgeId: off.badgeId || '',
      mobile: off.mobile || '',
      email: off.email || '',
      password: '',
      rank: off.rank || 'SI',
      designation: off.designation || '',
      district: off.district || '',
      station: off.station || '',
    });
    setModalError('');
  };

  const handleUpdateOfficer = async (e) => {
    e.preventDefault();
    if (!editingOfficer) return;
    setModalBusy(true);
    setModalError('');
    try {
      const payload = {
        name: officerForm.name.trim(),
        mobile: officerForm.mobile.trim() || null,
        email: officerForm.email.trim() || null,
        rank: officerForm.rank,
        designation: officerForm.designation.trim() || null,
        station: officerForm.station ? officerForm.station.trim() : null,
      };
      if (isSuperAdmin && officerForm.district) {
        payload.district = officerForm.district.trim();
      }

      await api(`/admin/officers/${editingOfficer.id}`, { method: 'PATCH', body: payload });
      setEditingOfficer(null);
      notifySuccess(`अधिकारी ${payload.name} का विवरण अपडेट हो गया।`);
      loadOfficers();
    } catch (err) {
      setModalError(err.message || 'अधिकारी अपडेट करने में त्रुटि।');
    } finally {
      setModalBusy(false);
    }
  };

  // Handle Toggle Officer Status
  const handleToggleOfficerStatus = async (off) => {
    const nextStatus = !off.isActive;
    const actionText = nextStatus ? 'सक्रिय' : 'निष्क्रिय';
    if (!window.confirm(`${off.name} को ${actionText} करना चाहते हैं?`)) return;

    try {
      await api(`/admin/officers/${off.id}/status`, {
        method: 'PATCH',
        body: { isActive: nextStatus },
      });
      notifySuccess(`अधिकारी ${off.name} अब ${actionText} है।`);
      loadOfficers();
    } catch (err) {
      setError(err.message || `अधिकारी की स्थिति बदलने में त्रुटि।`);
    }
  };

  // Handle Soft Delete Officer
  const handleDeleteOfficer = async () => {
    if (!deletingOfficer) return;
    setModalBusy(true);
    setModalError('');
    try {
      await api(`/admin/officers/${deletingOfficer.id}`, { method: 'DELETE' });
      notifySuccess(`अधिकारी ${deletingOfficer.name} को सुरक्षित रूप से हटा दिया गया (शिकायत इतिहास सुरक्षित है)।`);
      setDeletingOfficer(null);
      loadOfficers();
    } catch (err) {
      setModalError(err.message || 'अधिकारी हटाने में त्रुटि।');
    } finally {
      setModalBusy(false);
    }
  };

  // Handle Create District Admin
  const openAddAdmin = () => {
    setAdminForm({
      name: '',
      username: '',
      mobile: '',
      email: '',
      password: '',
      district: locationData.districts[0] || 'लखनऊ',
    });
    setModalError('');
    setShowAddAdminModal(true);
  };

  const handleCreateAdmin = async (e) => {
    e.preventDefault();
    setModalBusy(true);
    setModalError('');
    try {
      const payload = {
        name: adminForm.name.trim(),
        username: adminForm.username.trim() || undefined,
        mobile: adminForm.mobile.trim(),
        email: adminForm.email.trim(),
        password: adminForm.password,
        district: adminForm.district.trim(),
        adminRole: 'district_admin',
      };

      await api('/admin/admins', { method: 'POST', body: payload });
      setShowAddAdminModal(false);
      notifySuccess(`ज़िला व्यवस्थापक (${payload.name} — ${payload.district}) खाता बनाया गया।`);
      loadAdmins();
    } catch (err) {
      setModalError(err.message || 'ज़िला व्यवस्थापक खाता बनाने में त्रुटि।');
    } finally {
      setModalBusy(false);
    }
  };

  // Handle Edit District Admin (Reassign District)
  const openEditAdmin = (adm) => {
    setEditingAdmin(adm);
    setAdminForm({
      name: adm.name || '',
      username: adm.username || '',
      mobile: adm.mobile || '',
      email: adm.email || '',
      password: '',
      district: adm.district || (locationData.districts[0] || ''),
    });
    setModalError('');
  };

  const handleUpdateAdmin = async (e) => {
    e.preventDefault();
    if (!editingAdmin) return;
    setModalBusy(true);
    setModalError('');
    try {
      const payload = {
        name: adminForm.name.trim(),
        mobile: adminForm.mobile.trim() || null,
        email: adminForm.email.trim() || null,
        district: adminForm.district.trim(),
      };

      await api(`/admin/admins/${editingAdmin.id}`, { method: 'PATCH', body: payload });
      setEditingAdmin(null);
      notifySuccess(`व्यवस्थापक ${payload.name} का ज़िला/विवरण अपडेट हो गया (${payload.district})।`);
      loadAdmins();
    } catch (err) {
      setModalError(err.message || 'व्यवस्थापक अपडेट करने में त्रुटि।');
    } finally {
      setModalBusy(false);
    }
  };

  // Handle Toggle Admin Status
  const handleToggleAdminStatus = async (adm) => {
    const nextStatus = !adm.isActive;
    const actionText = nextStatus ? 'सक्रिय' : 'निष्क्रिय';
    if (!window.confirm(`${adm.name} को ${actionText} करना चाहते हैं?`)) return;

    try {
      await api(`/admin/admins/${adm.id}/status`, {
        method: 'PATCH',
        body: { isActive: nextStatus },
      });
      notifySuccess(`व्यवस्थापक ${adm.name} अब ${actionText} है।`);
      loadAdmins();
    } catch (err) {
      setError(err.message || 'स्थिति बदलने में त्रुटि।');
    }
  };

  return (
    <>
      <div className="page-head" style={{ alignItems: 'flex-start' }}>
        <div>
          <h1>अधिकारी एवं व्यवस्थापक प्रबंधन</h1>
          <div style={{ color: 'var(--ink-3)', marginTop: 4 }}>
            {isSuperAdmin && 'उत्तर प्रदेश राज्य — समस्त ज़िले एवं अधिकारी नियंत्रण'}
            {isDistrictAdmin && `ज़िला: ${admin?.district || 'असाइन किया गया ज़िला'} (निर्धारित अधिकार क्षेत्र)`}
            {isMonitor && `निगरानी मोड (${admin?.rank || 'अधिकारी'} — ${admin?.district || 'Range'})`}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={activeTab === 'officers' ? loadOfficers : loadAdmins}
            disabled={officersLoading || adminsLoading}
            className="btn btn-quiet"
          >
            ↻ रीफ्रेश
          </button>

          {activeTab === 'officers' && canManageOfficers && (
            <button
              type="button"
              onClick={openAddOfficer}
              className="btn btn-primary"
            >
              + नया अधिकारी जोड़ें
            </button>
          )}

          {activeTab === 'district_admins' && isSuperAdmin && (
            <button
              type="button"
              onClick={openAddAdmin}
              className="btn btn-primary"
            >
              + नया ज़िला व्यवस्थापक
            </button>
          )}
        </div>
      </div>

      {/* Tabs navigation for Super Admin */}
      {isSuperAdmin && (
        <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
          <button
            type="button"
            className={`btn ${activeTab === 'officers' ? 'btn-primary' : 'btn-quiet'}`}
            onClick={() => setActiveTab('officers')}
          >
            👮 पुलिस अधिकारी ({officers.length})
          </button>
          <button
            type="button"
            className={`btn ${activeTab === 'district_admins' ? 'btn-primary' : 'btn-quiet'}`}
            onClick={() => setActiveTab('district_admins')}
          >
            🏛️ ज़िला व्यवस्थापक ({adminsList.length})
          </button>
        </div>
      )}

      {error && (
        <div className="error-box" style={{ marginBottom: 16 }}>
          <strong>त्रुटि:</strong> {error}
        </div>
      )}

      {success && (
        <div
          className="card"
          style={{
            marginBottom: 16,
            padding: '12px 16px',
            backgroundColor: 'var(--ok-wash)',
            borderColor: 'var(--ok)',
            color: 'var(--ok)',
            fontWeight: 600,
          }}
        >
          ✓ {success}
        </div>
      )}

      {/* ===================== VIEW 1: OFFICERS LIST ===================== */}
      {activeTab === 'officers' && (
        <div className="card" style={{ padding: 16 }}>
          {/* Filters Bar */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: 12,
              marginBottom: 16,
              alignItems: 'end',
            }}
          >
            <div>
              <label style={labelStyle}>खोज (नाम / PNO / मोबाइल)</label>
              <input
                type="text"
                className="input"
                placeholder="खोजें..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            {/* Super Admin District Filter */}
            {isSuperAdmin && (
              <div>
                <label style={labelStyle}>ज़िला चुनें</label>
                <select
                  className="input"
                  value={filterDistrict}
                  onChange={(e) => {
                    setFilterDistrict(e.target.value);
                    setFilterStation('');
                  }}
                >
                  <option value="">सभी ज़िले (समस्त उत्तर प्रदेश)</option>
                  {locationData.districts.map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </div>
            )}

            {/* District Admin District Badge */}
            {isDistrictAdmin && (
              <div>
                <label style={labelStyle}>अधिकार क्षेत्र (ज़िला)</label>
                <div style={{ padding: '9px 12px', background: 'var(--card-sunk)', borderRadius: 'var(--r)', border: '1px solid var(--rule)' }}>
                  <strong>📍 {admin?.district || 'निर्धारित ज़िला'}</strong>
                </div>
              </div>
            )}

            {/* Station Filter */}
            <div>
              <label style={labelStyle}>थाना चुनें</label>
              <select
                className="input"
                value={filterStation}
                onChange={(e) => setFilterStation(e.target.value)}
              >
                <option value="">सभी थाने</option>
                {filterStationOptions.map((st) => (
                  <option key={st} value={st}>{st}</option>
                ))}
              </select>
            </div>

            {/* Status Filter */}
            <div>
              <label style={labelStyle}>स्थिति (Status)</label>
              <select
                className="input"
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
              >
                <option value="all">सभी अधिकारी</option>
                <option value="active">सक्रिय (Active)</option>
                <option value="inactive">निष्क्रिय (Inactive)</option>
              </select>
            </div>
          </div>

          {/* Officers Table */}
          {officersLoading ? (
            <div className="empty">
              <strong>अधिकारी सूची लोड हो रही है...</strong>
            </div>
          ) : officers.length === 0 ? (
            <div className="empty">
              <strong>कोई अधिकारी नहीं मिला</strong>
              <div style={{ marginTop: 6 }}>
                दिए गए फ़िल्टर के अनुसार कोई अधिकारी रिकॉर्ड उपलब्ध नहीं है।
              </div>
            </div>
          ) : (
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>नाम व पद</th>
                    <th>पुलिस ID / PNO</th>
                    <th>संपर्क (मोबाइल / ईमेल)</th>
                    <th>थाना व ज़िला</th>
                    <th>स्थिति</th>
                    {canManageOfficers && <th style={{ textAlign: 'right' }}>कार्रवाई</th>}
                  </tr>
                </thead>
                <tbody>
                  {officers.map((officer) => {
                    const id = officer.id;
                    const name = valueOf(officer, 'name', 'fullName');
                    const badgeId = valueOf(officer, 'badgeId', 'badge_id', 'pno');
                    const mobile = valueOf(officer, 'mobile', 'phone');
                    const email = valueOf(officer, 'email');
                    const rank = valueOf(officer, 'rank', 'designation');
                    const designation = officer.designation || '';
                    const station = valueOf(officer, 'station', 'stationName');
                    const district = valueOf(officer, 'district', 'districtName');
                    const isActive = officer.isActive !== false && officer.is_active !== false && String(officer.status).toLowerCase() !== 'inactive';

                    return (
                      <tr key={id}>
                        <td>
                          <strong>{name}</strong>
                          <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 2 }}>
                            <span className="pill pill-mute" style={{ marginRight: 6 }}>{rank}</span>
                            {designation && <span>{designation}</span>}
                          </div>
                        </td>

                        <td className="num">{badgeId}</td>

                        <td>
                          <div>{mobile}</div>
                          {email && email !== '—' && (
                            <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>{email}</div>
                          )}
                        </td>

                        <td>
                          <strong>{station}</strong>
                          <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>{district}</div>
                        </td>

                        <td>
                          <span className={`pill ${isActive ? 'pill-ok' : 'pill-alarm'}`}>
                            {isActive ? 'सक्रिय' : 'निष्क्रिय'}
                          </span>
                        </td>

                        {canManageOfficers && (
                          <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                            <button
                              type="button"
                              className="btn btn-quiet"
                              style={{ padding: '4px 8px', fontSize: 12, marginRight: 6 }}
                              onClick={() => openEditOfficer(officer)}
                            >
                              संपादित करें
                            </button>
                            <button
                              type="button"
                              className="btn btn-quiet"
                              style={{ padding: '4px 8px', fontSize: 12, marginRight: 6 }}
                              onClick={() => handleToggleOfficerStatus(officer)}
                            >
                              {isActive ? 'निष्क्रिय करें' : 'सक्रिय करें'}
                            </button>
                            <button
                              type="button"
                              className="btn btn-quiet"
                              style={{ padding: '4px 8px', fontSize: 12, color: 'var(--alarm)' }}
                              onClick={() => {
                                setDeletingOfficer(officer);
                                setModalError('');
                              }}
                            >
                              हटाएं
                            </button>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ===================== VIEW 2: DISTRICT ADMINS (SUPER ADMIN ONLY) ===================== */}
      {activeTab === 'district_admins' && isSuperAdmin && (
        <div className="card" style={{ padding: 16 }}>
          <div style={{ marginBottom: 16 }}>
            <h3 style={{ marginBottom: 4 }}>उत्तर प्रदेश ज़िला व्यवस्थापक सूची</h3>
            <div style={{ color: 'var(--ink-3)', fontSize: 13 }}>
              प्रत्येक ज़िले के व्यवस्थापक को केवल अपने ज़िले के अंतर्गत अधिकारी प्रबंधन की अनुमति होती है।
            </div>
          </div>

          {adminsLoading ? (
            <div className="empty">
              <strong>व्यवस्थापक सूची लोड हो रही है...</strong>
            </div>
          ) : adminsList.length === 0 ? (
            <div className="empty">
              <strong>कोई व्यवस्थापक नहीं मिला</strong>
            </div>
          ) : (
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>व्यवस्थापक नाम</th>
                    <th>यूजरनेम / ईमेल</th>
                    <th>मोबाइल नंबर</th>
                    <th>असाइन किया गया ज़िला</th>
                    <th>भूमिका / पद</th>
                    <th>स्थिति</th>
                    <th style={{ textAlign: 'right' }}>कार्रवाई</th>
                  </tr>
                </thead>
                <tbody>
                  {adminsList.map((adm) => {
                    const isAdmActive = adm.isActive !== false && adm.is_active !== false;
                    const isTargetSuper = adm.adminRole === 'super_admin' || adm.admin_role === 'super_admin';

                    return (
                      <tr key={adm.id}>
                        <td>
                          <strong>{adm.name}</strong>
                        </td>

                        <td>
                          <div>{adm.email || adm.username || '—'}</div>
                        </td>

                        <td className="num">{adm.mobile || '—'}</td>

                        <td>
                          <span className="pill pill-mute">
                            📍 {adm.district || 'समस्त राज्य (Super Admin)'}
                          </span>
                        </td>

                        <td>
                          <span className={`pill ${isTargetSuper ? 'pill-alarm' : 'pill-ok'}`}>
                            {isTargetSuper ? 'Super Admin' : (adm.rank || 'District Admin')}
                          </span>
                        </td>

                        <td>
                          <span className={`pill ${isAdmActive ? 'pill-ok' : 'pill-alarm'}`}>
                            {isAdmActive ? 'सक्रिय' : 'निष्क्रिय'}
                          </span>
                        </td>

                        <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                          {!isTargetSuper && (
                            <>
                              <button
                                type="button"
                                className="btn btn-quiet"
                                style={{ padding: '4px 8px', fontSize: 12, marginRight: 6 }}
                                onClick={() => openEditAdmin(adm)}
                              >
                                ज़िला बदलें / संपादित करें
                              </button>
                              <button
                                type="button"
                                className="btn btn-quiet"
                                style={{ padding: '4px 8px', fontSize: 12 }}
                                onClick={() => handleToggleAdminStatus(adm)}
                              >
                                {isAdmActive ? 'निष्क्रिय करें' : 'सक्रिय करें'}
                              </button>
                            </>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ===================== MODAL: ADD OFFICER ===================== */}
      {showAddOfficerModal && (
        <div style={modalOverlayStyle}>
          <div className="card" style={modalContentStyle}>
            <h2>+ नया पुलिस अधिकारी जोड़ें</h2>
            <p style={{ color: 'var(--ink-3)', fontSize: 13, marginTop: 4, marginBottom: 16 }}>
              {isDistrictAdmin ? `ज़िला "${admin?.district}" में नया अधिकारी पंजीकृत करें` : 'उत्तर प्रदेश पुलिस अधिकारी पंजीकरण'}
            </p>

            {modalError && <div className="error-box" style={{ marginBottom: 12 }}>{modalError}</div>}

            <form onSubmit={handleCreateOfficer}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="field">
                  <span>पूरा नाम *</span>
                  <input
                    type="text"
                    required
                    className="input"
                    value={officerForm.name}
                    onChange={(e) => setOfficerForm({ ...officerForm, name: e.target.value })}
                  />
                </div>

                <div className="field">
                  <span>पुलिस ID / PNO *</span>
                  <input
                    type="text"
                    required
                    className="input"
                    placeholder="जैसे: 200953125"
                    value={officerForm.badgeId}
                    onChange={(e) => setOfficerForm({ ...officerForm, badgeId: e.target.value })}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="field">
                  <span>मोबाइल नंबर *</span>
                  <input
                    type="tel"
                    required
                    maxLength={10}
                    className="input"
                    placeholder="10 अंकों का मोबाइल"
                    value={officerForm.mobile}
                    onChange={(e) => setOfficerForm({ ...officerForm, mobile: e.target.value })}
                  />
                </div>

                <div className="field">
                  <span>ईमेल {officerForm.rank === 'SHO' ? '*' : '(वैकल्पिक)'}</span>
                  <input
                    type="email"
                    required={officerForm.rank === 'SHO'}
                    className="input"
                    placeholder="police@uppolice.gov.in"
                    value={officerForm.email}
                    onChange={(e) => setOfficerForm({ ...officerForm, email: e.target.value })}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="field">
                  <span>लॉगिन पासवर्ड *</span>
                  <input
                    type="password"
                    required
                    className="input"
                    placeholder="कम से कम 8 अक्षर"
                    value={officerForm.password}
                    onChange={(e) => setOfficerForm({ ...officerForm, password: e.target.value })}
                  />
                </div>

                <div className="field">
                  <span>पद / Rank *</span>
                  <select
                    className="input"
                    value={officerForm.rank}
                    onChange={(e) => setOfficerForm({ ...officerForm, rank: e.target.value })}
                  >
                    <option value="SI">SI (सब-इंस्पेक्टर)</option>
                    <option value="SHO">SHO (थाना प्रभारी)</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="field">
                  <span>ज़िला {isDistrictAdmin && '(निर्धारित)'}</span>
                  {isDistrictAdmin ? (
                    <input
                      type="text"
                      disabled
                      className="input"
                      value={admin?.district || ''}
                    />
                  ) : (
                    <select
                      className="input"
                      value={officerForm.district}
                      onChange={(e) => {
                        const newD = e.target.value;
                        const sts = locationData.stationsByDistrict[newD] || [];
                        setOfficerForm({
                          ...officerForm,
                          district: newD,
                          station: sts[0] || '',
                        });
                      }}
                    >
                      {locationData.districts.map((d) => (
                        <option key={d} value={d}>{d}</option>
                      ))}
                    </select>
                  )}
                </div>

                <div className="field">
                  <span>थाना *</span>
                  <select
                    className="input"
                    value={officerForm.station}
                    onChange={(e) => setOfficerForm({ ...officerForm, station: e.target.value })}
                  >
                    <option value="">थाना चुनें</option>
                    {formStationOptions.map((st) => (
                      <option key={st} value={st}>{st}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="field">
                <span>विशिष्ट पदनाम / Designation (वैकल्पिक)</span>
                <input
                  type="text"
                  className="input"
                  placeholder="उदा. चौकी प्रभारी / अपराध शाखा निरीक्षक"
                  value={officerForm.designation}
                  onChange={(e) => setOfficerForm({ ...officerForm, designation: e.target.value })}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
                <button
                  type="button"
                  className="btn btn-quiet"
                  onClick={() => setShowAddOfficerModal(false)}
                  disabled={modalBusy}
                >
                  रद्द करें
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={modalBusy}
                >
                  {modalBusy ? 'सहेजा जा रहा है...' : 'अधिकारी जोड़ें'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===================== MODAL: EDIT OFFICER ===================== */}
      {editingOfficer && (
        <div style={modalOverlayStyle}>
          <div className="card" style={modalContentStyle}>
            <h2>अधिकारी विवरण संपादित करें</h2>
            <p style={{ color: 'var(--ink-3)', fontSize: 13, marginTop: 4, marginBottom: 16 }}>
              {editingOfficer.name} ({editingOfficer.badgeId})
            </p>

            {modalError && <div className="error-box" style={{ marginBottom: 12 }}>{modalError}</div>}

            <form onSubmit={handleUpdateOfficer}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="field">
                  <span>पूरा नाम *</span>
                  <input
                    type="text"
                    required
                    className="input"
                    value={officerForm.name}
                    onChange={(e) => setOfficerForm({ ...officerForm, name: e.target.value })}
                  />
                </div>

                <div className="field">
                  <span>पुलिस ID / PNO (स्थिर)</span>
                  <input
                    type="text"
                    disabled
                    className="input"
                    value={editingOfficer.badgeId}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="field">
                  <span>मोबाइल नंबर</span>
                  <input
                    type="tel"
                    maxLength={10}
                    className="input"
                    value={officerForm.mobile}
                    onChange={(e) => setOfficerForm({ ...officerForm, mobile: e.target.value })}
                  />
                </div>

                <div className="field">
                  <span>ईमेल</span>
                  <input
                    type="email"
                    className="input"
                    value={officerForm.email}
                    onChange={(e) => setOfficerForm({ ...officerForm, email: e.target.value })}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="field">
                  <span>पद / Rank</span>
                  <select
                    className="input"
                    value={officerForm.rank}
                    onChange={(e) => setOfficerForm({ ...officerForm, rank: e.target.value })}
                  >
                    <option value="SI">SI (सब-इंस्पेक्टर)</option>
                    <option value="SHO">SHO (थाना प्रभारी)</option>
                  </select>
                </div>

                <div className="field">
                  <span>विशिष्ट पदनाम (Designation)</span>
                  <input
                    type="text"
                    className="input"
                    value={officerForm.designation}
                    onChange={(e) => setOfficerForm({ ...officerForm, designation: e.target.value })}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="field">
                  <span>ज़िला {isDistrictAdmin && '(अपरिवर्तनीय)'}</span>
                  {isDistrictAdmin ? (
                    <input
                      type="text"
                      disabled
                      className="input"
                      value={editingOfficer.district || ''}
                    />
                  ) : (
                    <select
                      className="input"
                      value={officerForm.district}
                      onChange={(e) => {
                        const newD = e.target.value;
                        const sts = locationData.stationsByDistrict[newD] || [];
                        setOfficerForm({
                          ...officerForm,
                          district: newD,
                          station: sts[0] || '',
                        });
                      }}
                    >
                      {locationData.districts.map((d) => (
                        <option key={d} value={d}>{d}</option>
                      ))}
                    </select>
                  )}
                </div>

                <div className="field">
                  <span>थाना</span>
                  <select
                    className="input"
                    value={officerForm.station}
                    onChange={(e) => setOfficerForm({ ...officerForm, station: e.target.value })}
                  >
                    <option value="">थाना चुनें</option>
                    {formStationOptions.map((st) => (
                      <option key={st} value={st}>{st}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
                <button
                  type="button"
                  className="btn btn-quiet"
                  onClick={() => setEditingOfficer(null)}
                  disabled={modalBusy}
                >
                  रद्द करें
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={modalBusy}
                >
                  {modalBusy ? 'सहेजा जा रहा है...' : 'अपडेट करें'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===================== MODAL: SAFE REMOVE OFFICER ===================== */}
      {deletingOfficer && (
        <div style={modalOverlayStyle}>
          <div className="card" style={{ ...modalContentStyle, maxWidth: 480 }}>
            <h2 style={{ color: 'var(--alarm)' }}>अधिकारी को सेवा से हटाएं?</h2>
            <div style={{ marginTop: 10, fontSize: 14, lineHeight: 1.6 }}>
              क्या आप <strong>{deletingOfficer.name}</strong> ({deletingOfficer.badgeId} — {deletingOfficer.station}, {deletingOfficer.district}) को हटाना चाहते हैं?
            </div>

            <div
              style={{
                marginTop: 12,
                padding: '10px 14px',
                background: 'var(--alarm-wash)',
                borderRadius: 'var(--r)',
                fontSize: 13,
                color: 'var(--alarm)',
              }}
            >
              ⚠️ <strong>सुरक्षित निष्कासन नीति (Safe Removal):</strong>
              <ul style={{ margin: '6px 0 0 18px', padding: 0 }}>
                <li>यदि इस अधिकारी के पास कोई सक्रिय/खुली शिकायतें नियुक्त हैं, तो हटाने की अनुमति नहीं होगी।</li>
                <li>अधिकारी की पूर्व शिकायतों और जांच की ऐतिहासिक अखंडता सुरक्षित रहेगी।</li>
              </ul>
            </div>

            {modalError && <div className="error-box" style={{ marginTop: 12 }}>{modalError}</div>}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
              <button
                type="button"
                className="btn btn-quiet"
                onClick={() => setDeletingOfficer(null)}
                disabled={modalBusy}
              >
                रद्द करें
              </button>
              <button
                type="button"
                className="btn btn-primary"
                style={{ background: 'var(--alarm)', borderColor: 'var(--alarm)' }}
                onClick={handleDeleteOfficer}
                disabled={modalBusy}
              >
                {modalBusy ? 'हटाया जा रहा है...' : 'हां, सुरक्षित रूप से हटाएं'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===================== MODAL: CREATE DISTRICT ADMIN ===================== */}
      {showAddAdminModal && (
        <div style={modalOverlayStyle}>
          <div className="card" style={modalContentStyle}>
            <h2>+ नया ज़िला व्यवस्थापक खाता बनाएं</h2>
            <p style={{ color: 'var(--ink-3)', fontSize: 13, marginTop: 4, marginBottom: 16 }}>
              Super Admin द्वारा ज़िला-स्तरीय प्रशासनिक नियंत्रण प्रदान करें।
            </p>

            {modalError && <div className="error-box" style={{ marginBottom: 12 }}>{modalError}</div>}

            <form onSubmit={handleCreateAdmin}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="field">
                  <span>पूरा नाम *</span>
                  <input
                    type="text"
                    required
                    className="input"
                    value={adminForm.name}
                    onChange={(e) => setAdminForm({ ...adminForm, name: e.target.value })}
                  />
                </div>

                <div className="field">
                  <span>यूजरनेम (वैकल्पिक)</span>
                  <input
                    type="text"
                    className="input"
                    placeholder="उदा. sp_lucknow"
                    value={adminForm.username}
                    onChange={(e) => setAdminForm({ ...adminForm, username: e.target.value })}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="field">
                  <span>मोबाइल नंबर *</span>
                  <input
                    type="tel"
                    required
                    maxLength={10}
                    className="input"
                    placeholder="10 अंकों का मोबाइल"
                    value={adminForm.mobile}
                    onChange={(e) => setAdminForm({ ...adminForm, mobile: e.target.value })}
                  />
                </div>

                <div className="field">
                  <span>ईमेल आईडी *</span>
                  <input
                    type="email"
                    required
                    className="input"
                    placeholder="admin@uppolice.gov.in"
                    value={adminForm.email}
                    onChange={(e) => setAdminForm({ ...adminForm, email: e.target.value })}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="field">
                  <span>पासवर्ड *</span>
                  <input
                    type="password"
                    required
                    className="input"
                    placeholder="सुरक्षित पासवर्ड"
                    value={adminForm.password}
                    onChange={(e) => setAdminForm({ ...adminForm, password: e.target.value })}
                  />
                </div>

                <div className="field">
                  <span>असाइन किया गया ज़िला *</span>
                  <select
                    className="input"
                    required
                    value={adminForm.district}
                    onChange={(e) => setAdminForm({ ...adminForm, district: e.target.value })}
                  >
                    {locationData.districts.map((d) => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
                <button
                  type="button"
                  className="btn btn-quiet"
                  onClick={() => setShowAddAdminModal(false)}
                  disabled={modalBusy}
                >
                  रद्द करें
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={modalBusy}
                >
                  {modalBusy ? 'सहेजा जा रहा है...' : 'व्यवस्थापक खाता बनाएं'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===================== MODAL: EDIT DISTRICT ADMIN ===================== */}
      {editingAdmin && (
        <div style={modalOverlayStyle}>
          <div className="card" style={modalContentStyle}>
            <h2>ज़िला व्यवस्थापक संपादित करें</h2>
            <p style={{ color: 'var(--ink-3)', fontSize: 13, marginTop: 4, marginBottom: 16 }}>
              {editingAdmin.name} — अधिकार क्षेत्र व संपर्क विवरण अपडेट करें
            </p>

            {modalError && <div className="error-box" style={{ marginBottom: 12 }}>{modalError}</div>}

            <form onSubmit={handleUpdateAdmin}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="field">
                  <span>पूरा नाम *</span>
                  <input
                    type="text"
                    required
                    className="input"
                    value={adminForm.name}
                    onChange={(e) => setAdminForm({ ...adminForm, name: e.target.value })}
                  />
                </div>

                <div className="field">
                  <span>असाइन किया गया ज़िला (Reassign District) *</span>
                  <select
                    className="input"
                    required
                    value={adminForm.district}
                    onChange={(e) => setAdminForm({ ...adminForm, district: e.target.value })}
                  >
                    {locationData.districts.map((d) => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="field">
                  <span>मोबाइल नंबर</span>
                  <input
                    type="tel"
                    maxLength={10}
                    className="input"
                    value={adminForm.mobile}
                    onChange={(e) => setAdminForm({ ...adminForm, mobile: e.target.value })}
                  />
                </div>

                <div className="field">
                  <span>ईमेल आईडी</span>
                  <input
                    type="email"
                    className="input"
                    value={adminForm.email}
                    onChange={(e) => setAdminForm({ ...adminForm, email: e.target.value })}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
                <button
                  type="button"
                  className="btn btn-quiet"
                  onClick={() => setEditingAdmin(null)}
                  disabled={modalBusy}
                >
                  रद्द करें
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={modalBusy}
                >
                  {modalBusy ? 'सहेजा जा रहा है...' : 'अपडेट सहेजें'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

const labelStyle = {
  display: 'block',
  fontSize: 12,
  fontWeight: 600,
  color: 'var(--ink-3)',
  marginBottom: 4,
};

const modalOverlayStyle = {
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  backgroundColor: 'rgba(15, 42, 68, 0.55)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1000,
  padding: 16,
};

const modalContentStyle = {
  width: '100%',
  maxWidth: 580,
  padding: 24,
  maxHeight: '90vh',
  overflowY: 'auto',
};