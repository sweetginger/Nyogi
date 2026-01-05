"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

export default function NewMeetingPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    title: "",
    type: "google_meet" as "in_person" | "google_meet" | "zoom",
    meetUrl: "",
    languages: ["ko", "en"],
    inviteMode: "now" as "now" | "later" | "scheduled",
    scheduledAt: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await fetch("/api/meetings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...formData,
          scheduledAt: formData.inviteMode === "scheduled" && formData.scheduledAt
            ? formData.scheduledAt
            : null,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to create meeting");
      }

      const meeting = await response.json();
      router.push(`/meetings/${meeting.id}`);
    } catch (error) {
      console.error("Error creating meeting:", error);
      alert("Failed to create meeting. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold mb-6">Create New Meeting</h1>
      <div className="max-w-2xl">
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <Label htmlFor="title">Title *</Label>
            <Input
              id="title"
              required
              value={formData.title}
              onChange={(e) =>
                setFormData({ ...formData, title: e.target.value })
              }
              placeholder="Meeting title"
              className="mt-2"
            />
          </div>

          <div>
            <Label htmlFor="type">Type *</Label>
            <Select
              id="type"
              required
              value={formData.type}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  type: e.target.value as "in_person" | "google_meet" | "zoom",
                })
              }
              className="mt-2"
            >
              <option value="in_person">In Person</option>
              <option value="google_meet">Google Meet</option>
              <option value="zoom">Zoom</option>
            </Select>
          </div>

          {(formData.type === "google_meet" || formData.type === "zoom") && (
            <div>
              <Label htmlFor="meetUrl">Meeting URL</Label>
              <Input
                id="meetUrl"
                type="url"
                value={formData.meetUrl}
                onChange={(e) =>
                  setFormData({ ...formData, meetUrl: e.target.value })
                }
                placeholder="https://..."
                className="mt-2"
              />
            </div>
          )}

          <div>
            <Label htmlFor="inviteMode">Invite Mode *</Label>
            <Select
              id="inviteMode"
              required
              value={formData.inviteMode}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  inviteMode: e.target.value as "now" | "later" | "scheduled",
                })
              }
              className="mt-2"
            >
              <option value="now">Now</option>
              <option value="later">Later</option>
              <option value="scheduled">Scheduled</option>
            </Select>
          </div>

          {formData.inviteMode === "scheduled" && (
            <div>
              <Label htmlFor="scheduledAt">Scheduled At</Label>
              <Input
                id="scheduledAt"
                type="datetime-local"
                value={formData.scheduledAt}
                onChange={(e) =>
                  setFormData({ ...formData, scheduledAt: e.target.value })
                }
                className="mt-2"
              />
            </div>
          )}

          <div className="flex gap-4">
            <Button type="submit" disabled={loading}>
              {loading ? "Creating..." : "Create Meeting"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => router.back()}
            >
              Cancel
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
