"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";

interface MeetingAccessEditorProps {
  meetingId: string;
  initialMode: "public" | "allowlist";
  initialAllowEmails: string[];
}

export function MeetingAccessEditor({
  meetingId,
  initialMode,
  initialAllowEmails,
}: MeetingAccessEditorProps) {
  const router = useRouter();
  const [mode, setMode] = useState<"public" | "allowlist">(initialMode);
  const [allowEmails, setAllowEmails] = useState<string[]>(initialAllowEmails);
  const [newEmail, setNewEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleSave = async () => {
    setLoading(true);
    setSaved(false);

    try {
      const response = await fetch(`/api/meetings/${meetingId}/access`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          mode,
          allowEmails,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to update access");
      }

      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
      
      // 서버 컴포넌트를 새로고침하여 최신 데이터 반영
      router.refresh();
    } catch (error) {
      console.error("Error updating access:", error);
      alert("Failed to update access. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleAddEmail = () => {
    if (newEmail && !allowEmails.includes(newEmail)) {
      setAllowEmails([...allowEmails, newEmail]);
      setNewEmail("");
    }
  };

  const handleRemoveEmail = (email: string) => {
    setAllowEmails(allowEmails.filter((e) => e !== email));
  };

  return (
    <div className="space-y-4">
      <div>
        <Label htmlFor="accessMode">Access Mode</Label>
        <Select
          id="accessMode"
          value={mode}
          onChange={(e) =>
            setMode(e.target.value as "public" | "allowlist")
          }
          className="mt-2"
        >
          <option value="public">Public (Anyone can access)</option>
          <option value="allowlist">Allowlist (Only specified emails)</option>
        </Select>
      </div>

      {mode === "allowlist" && (
        <div>
          <Label>Allowed Emails</Label>
          <div className="mt-2 space-y-2">
            <div className="flex gap-2">
              <Input
                type="email"
                placeholder="Enter email address"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAddEmail();
                  }
                }}
              />
              <Button type="button" onClick={handleAddEmail} variant="outline">
                Add
              </Button>
            </div>
            {allowEmails.length > 0 && (
              <div className="space-y-1">
                {allowEmails.map((email) => (
                  <div
                    key={email}
                    className="flex items-center justify-between bg-muted px-3 py-2 rounded"
                  >
                    <span className="text-sm">{email}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRemoveEmail(email)}
                    >
                      Remove
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="flex items-center gap-4">
        <Button onClick={handleSave} disabled={loading}>
          {loading ? "Saving..." : "Save Changes"}
        </Button>
        {saved && (
          <span className="text-sm text-green-600">Saved successfully!</span>
        )}
      </div>
    </div>
  );
}

