$headers = @{ "Content-Type" = "application/json" }

$body1 = @{
    programName = "Gym"
    customerCategory = "prima_grup"
    packageCode = "GYM-BASIC"
    name = "Gym Basic 1 Bulan (Prima Grup)"
    description = "Akses gym 1 bulan khusus pegawai Prima Grup."
    price = 250000
    durationDays = 30
    benefits = @("Akses Gym", "Loker", "Free Wifi")
    personalTrainerSessions = 0
    pilatesSessions = 0
} | ConvertTo-Json

Invoke-RestMethod -Method Post -Uri "http://192.168.1.72:3000/api/admin/membership-plans" -Headers $headers -Body $body1

$body2 = @{
    programName = "Personal Trainer"
    customerCategory = "non_prima_grup"
    packageCode = "PT-10"
    name = "Paket PT 10 Sesi"
    description = "Latihan dengan PT selama 10 sesi + gratis akses Gym."
    price = 1500000
    durationDays = 60
    benefits = @("10 Sesi PT", "Gym Access")
    personalTrainerSessions = 10
    pilatesSessions = 0
} | ConvertTo-Json

Invoke-RestMethod -Method Post -Uri "http://192.168.1.72:3000/api/admin/membership-plans" -Headers $headers -Body $body2

$body3 = @{
    programName = "Pilates"
    customerCategory = "non_prima_grup"
    packageCode = "PILATES-VIP"
    name = "Pilates VIP Class"
    description = "Kelas Pilates intensif 4x sebulan."
    price = 600000
    durationDays = 30
    benefits = @("4 Sesi Pilates", "Matras", "Handuk")
    personalTrainerSessions = 0
    pilatesSessions = 4
} | ConvertTo-Json

Invoke-RestMethod -Method Post -Uri "http://192.168.1.72:3000/api/admin/membership-plans" -Headers $headers -Body $body3
