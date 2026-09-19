"use client";

import { useEffect, useState } from "react";

type Staff = {
  id: string;
  staffCode: string;
  name: string;
  age?: number | null;
  gender?: string | null;
  photoData?: string | null;
};

type AttendanceRow = {
  id: string;
  staffId: string;
  date: string;
  checkIn?: string | null;
  checkOut?: string | null;
  status?: string;
  note?: string | null;
  virtual?: boolean;
};

export default function ManagerClient() {
  const [staff, setStaff] = useState<Staff[]>([]);
  const [rows, setRows] = useState<AttendanceRow[]>([]);
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const [absentStaff, setAbsentStaff] = useState<Staff | null>(null);
  const [reason, setReason] = useState("");

  async function load() {
    try {
      const [staffRes, attendanceRes] = await Promise.all([
        fetch("/api/staff", { cache: "no-store" }),
        fetch("/api/attendance", { cache: "no-store" }),
      ]);
      const staffJson = await staffRes.json();
      const attendanceJson = await attendanceRes.json();
      setStaff(Array.isArray(staffJson) ? staffJson : []);
      setRows(Array.isArray(attendanceJson) ? attendanceJson : []);
    } catch {
      setMessage("Unable to load attendance. Please try again.");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function mark(staffId: string, action: "checkin" | "checkout" | "absent", absenceReason = "") {
    setMessage("");
    try {
      const res = await fetch("/api/attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ staffId, action, reason: absenceReason }),
      });
      const json = await res.json();
      setMessage(res.ok ? "Attendance saved successfully." : json.error || "Attendance failed.");
      if (res.ok) {
        setAbsentStaff(null);
        setReason("");
      }
      await load();
    } catch {
      setMessage("Unable to save attendance. Please try again.");
    }
  }

  const todayLabel = new Date().toLocaleDateString("en-IN", {
    timeZone: "Asia/Kolkata",
  });

  const filtered = staff.filter((person) =>
    (person.name + " " + person.staffCode).toLowerCase().includes(search.toLowerCase())
  );

  return (
    <>
      <header className="top">
        <div className="brand">
          VEG MANTRA
          <small>MOHAN NAGAR • MANAGER ATTENDANCE</small>
        </div>
        <button
          className="nav"
          onClick={async () => {
            await fetch("/api/auth/logout", { method: "POST" });
            window.location.href = "/login";
          }}
        >
          Logout
        </button>
      </header>

      <main className="wrap">
        <div className="hero">
          <span className="eyebrow">TODAY • IST</span>
          <h1>Staff Attendance</h1>
          <p className="muted">Search by name or Staff ID and record today's attendance.</p>
        </div>

        {message && <div className="notice">{message}</div>}

        <div className="card searchCard">
          <h2>Current Staff</h2>
          <p className="muted">All active staff members are shown below, with the same staff information available in the Owner panel.</p>
          <input
            placeholder="Search Staff ID or name…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>

        {filtered.length === 0 ? (
          <div className="card"><p className="muted">No current staff members found.</p></div>
        ) : filtered.map((person) => {
          const today = rows.find(
            (row) =>
              row.staffId === person.id &&
              new Date(row.date).toLocaleDateString("en-IN", {
                timeZone: "Asia/Kolkata",
              }) === todayLabel
          );
          const recorded = Boolean(today && !today.virtual);

          return (
            <div className="card staffCard" key={person.id}>
              <div className="personInfo">
                {person.photoData && <img src={person.photoData} alt="" />}
                <div>
                  <span className="staffId">{person.staffCode}</span>
                  <h3>{person.name}</h3>
                  <div className="muted">
                    Age {person.age ?? "—"} • {person.gender ?? "—"}
                  </div>
                </div>
              </div>

              <div className="actions attendanceActions">
                {!recorded && !today?.checkIn && (
                  <>
                    <button
                      className="btn quickAction"
                      onClick={() => void mark(person.id, "checkin")}
                    >
                      ✓ Check In
                    </button>
                    <button
                      className="btn danger quickAction"
                      onClick={() => {
                        setAbsentStaff(person);
                        setReason("");
                      }}
                    >
                      Mark Absent
                    </button>
                  </>
                )}
                {!recorded && today?.checkIn && !today?.checkOut && (
                  <button
                    className="btn quickAction checkoutAction"
                    onClick={() => void mark(person.id, "checkout")}
                  >
                    ✓ Check Out
                  </button>
                )}
                {today?.checkOut && (
                  <span className="attendanceComplete">✓ Attendance complete</span>
                )}
                {today?.status === "ABSENT" && recorded && (
                  <span className="attendanceComplete">✓ Marked absent</span>
                )}
              </div>

              <div className="attendanceState">
                {today?.status === "ABSENT" && recorded ? (
                  <>
                    <b>Absent</b>
                    {today.note && <span>Reason: {today.note}</span>}
                  </>
                ) : today?.checkIn ? (
                  <span>
                    Checked in{" "}
                    {new Date(today.checkIn).toLocaleTimeString("en-IN", {
                      timeZone: "Asia/Kolkata",
                    })}
                    {today.checkOut
                      ? " • Checked out " +
                        new Date(today.checkOut).toLocaleTimeString("en-IN", {
                          timeZone: "Asia/Kolkata",
                        })
                      : " • Not checked out"}
                  </span>
                ) : (
                  <span>Not recorded</span>
                )}
              </div>
            </div>
          );
        })}

        {absentStaff && (
          <div className="modalBackdrop">
            <div className="modal card">
              <h2>Mark {absentStaff.name} absent</h2>
              <p className="muted">
                {absentStaff.staffCode} • A reason is required and will be recorded in the Owner audit/attendance panel.
              </p>
              <textarea
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Enter reason for absence…"
                rows={4}
              />
              <div className="actions">
                <button className="btn secondary" onClick={() => setAbsentStaff(null)}>
                  Cancel
                </button>
                <button
                  className="btn danger"
                  disabled={!reason.trim()}
                  onClick={() => void mark(absentStaff.id, "absent", reason.trim())}
                >
                  Confirm Absent
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </>
  );
}
